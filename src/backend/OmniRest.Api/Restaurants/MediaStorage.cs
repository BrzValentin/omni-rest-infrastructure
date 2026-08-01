using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OmniRest.Api.Data;
using OmniRest.Api.Security;
using SixLabors.ImageSharp;

namespace OmniRest.Api.Restaurants;

public sealed class LocalMediaStorageOptions
{
    public const string SectionName = "MediaStorage";
    public string? LocalRoot { get; init; }
    public string PublicPathBase { get; init; } = "/media/uploads";
    public long MaximumBytes { get; init; } = 5 * 1024 * 1024;
    public int MaximumDimension { get; init; } = 8000;
    public long MaximumPixels { get; init; } = 40_000_000;
}

public sealed record ValidatedImage(byte[] Bytes, string Extension, string ContentType, int Width, int Height);

public sealed class StoredMedia : IAsyncDisposable
{
    private IStoredMediaLease? lease;

    public StoredMedia(string url, int width, int height)
        : this(url, width, height, null)
    {
    }

    internal StoredMedia(string url, int width, int height, IStoredMediaLease? lease)
    {
        Url = url;
        Width = width;
        Height = height;
        this.lease = lease;
    }

    public string Url { get; }
    public int Width { get; }
    public int Height { get; }

    internal Task CompensateAsync(CancellationToken cancellationToken) =>
        lease?.DeleteAsync(cancellationToken) ?? Task.CompletedTask;

    public ValueTask DisposeAsync()
    {
        var current = Interlocked.Exchange(ref lease, null);
        return current?.DisposeAsync() ?? ValueTask.CompletedTask;
    }
}

internal interface IStoredMediaLease : IAsyncDisposable
{
    Task DeleteAsync(CancellationToken cancellationToken);
}

public interface ILocalMediaStorage
{
    Task<ValidatedImage> ValidateAsync(IFormFile file, CancellationToken cancellationToken);
    Task<StoredMedia> StoreAsync(Guid restaurantId, Guid mediaAssetId, ValidatedImage image, CancellationToken cancellationToken);
    Task DeleteAsync(Guid restaurantId, Guid mediaAssetId, string extension, CancellationToken cancellationToken);
}

public sealed class LocalMediaStorage(IOptions<LocalMediaStorageOptions> options) : ILocalMediaStorage
{
    private static readonly IReadOnlyDictionary<string, string> Extensions = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/webp"] = ".webp"
    };

    public async Task<ValidatedImage> ValidateAsync(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length <= 0 || file.Length > options.Value.MaximumBytes)
        {
            throw new MediaValidationException("media_size_invalid");
        }
        await using var input = file.OpenReadStream();
        using var memory = new MemoryStream((int)file.Length);
        await input.CopyToAsync(memory, cancellationToken);
        var bytes = memory.ToArray();
        try
        {
            memory.Position = 0;
            var info = await Image.IdentifyAsync(memory, cancellationToken);
            var format = info.Metadata.DecodedImageFormat;
            if (format is null || !Extensions.TryGetValue(format.DefaultMimeType, out var extension) ||
                !string.Equals(file.ContentType, format.DefaultMimeType, StringComparison.OrdinalIgnoreCase) ||
                info.Width <= 0 || info.Height <= 0 || info.Width > options.Value.MaximumDimension ||
                info.Height > options.Value.MaximumDimension || (long)info.Width * info.Height > options.Value.MaximumPixels)
            {
                throw new MediaValidationException("media_content_invalid");
            }
            memory.Position = 0;
            using var decoded = await Image.LoadAsync(memory, cancellationToken);
            if (decoded.Width != info.Width || decoded.Height != info.Height)
            {
                throw new MediaValidationException("media_content_invalid");
            }
            return new ValidatedImage(bytes, extension, format.DefaultMimeType, info.Width, info.Height);
        }
        catch (MediaValidationException)
        {
            throw;
        }
        catch (Exception exception) when (exception is InvalidImageContentException or UnknownImageFormatException or NotSupportedException)
        {
            throw new MediaValidationException("media_content_invalid");
        }
    }

    public async Task<StoredMedia> StoreAsync(
        Guid restaurantId,
        Guid mediaAssetId,
        ValidatedImage image,
        CancellationToken cancellationToken)
    {
        var fileName = ResolveFileName(mediaAssetId, image.Extension);
        using var root = UnixMediaFileOperations.OpenDirectoryTree(ResolveRoot(), createIfMissing: true)
            ?? throw new IOException("The configured media root could not be opened.");
        var tenant = UnixMediaFileOperations.OpenChildDirectory(
            root, restaurantId.ToString("N"), createIfMissing: true)
            ?? throw new IOException("The tenant media directory could not be opened.");
        var created = false;
        try
        {
            try
            {
                await using var output = UnixMediaFileOperations.CreateFile(tenant, fileName);
                created = true;
                await output.WriteAsync(image.Bytes, cancellationToken);
                await output.FlushAsync(cancellationToken);
            }
            catch (Exception writeException)
            {
                if (!created)
                {
                    throw;
                }
                try
                {
                    UnixMediaFileOperations.DeleteFile(tenant, fileName);
                }
                catch (Exception cleanupException)
                {
                    throw new AggregateException(
                        "Media write and exact-file cleanup both failed.",
                        writeException,
                        cleanupException);
                }
                throw;
            }

            var basePath = options.Value.PublicPathBase.TrimEnd('/');
            return new StoredMedia(
                $"{basePath}/{restaurantId:N}/{fileName}",
                image.Width,
                image.Height,
                new UnixStoredMediaLease(tenant, fileName));
        }
        catch
        {
            tenant.Dispose();
            throw;
        }
    }

    public Task DeleteAsync(
        Guid restaurantId,
        Guid mediaAssetId,
        string extension,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var fileName = ResolveFileName(mediaAssetId, extension);
        using var root = UnixMediaFileOperations.OpenDirectoryTree(ResolveRoot(), createIfMissing: false);
        if (root is null)
        {
            return Task.CompletedTask;
        }
        using var tenant = UnixMediaFileOperations.OpenChildDirectory(
            root, restaurantId.ToString("N"), createIfMissing: false);
        if (tenant is null)
        {
            return Task.CompletedTask;
        }
        UnixMediaFileOperations.DeleteFile(tenant, fileName);
        return Task.CompletedTask;
    }

    private string ResolveRoot()
    {
        var root = Path.GetFullPath(options.Value.LocalRoot
            ?? throw new InvalidOperationException("A local media root is required."));
        if (OperatingSystem.IsMacOS() &&
            (string.Equals(root, "/tmp", StringComparison.Ordinal) ||
             root.StartsWith("/tmp/", StringComparison.Ordinal) ||
             string.Equals(root, "/var", StringComparison.Ordinal) ||
             root.StartsWith("/var/", StringComparison.Ordinal)))
        {
            // macOS exposes these immutable system aliases to /private. Normalize the known alias
            // before descriptor traversal; arbitrary configured symlinks remain fail-closed.
            return "/private" + root;
        }
        return root;
    }

    private static string ResolveFileName(Guid mediaAssetId, string extension)
    {
        if (!Extensions.Values.Contains(extension, StringComparer.Ordinal))
        {
            throw new InvalidOperationException("The media extension is not supported for local storage.");
        }
        return mediaAssetId.ToString("N") + extension;
    }
}

internal sealed class UnixStoredMediaLease(
    SafeFileHandle tenantDirectory,
    string fileName) : IStoredMediaLease
{
    public Task DeleteAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        UnixMediaFileOperations.DeleteFile(tenantDirectory, fileName);
        return Task.CompletedTask;
    }

    public ValueTask DisposeAsync()
    {
        tenantDirectory.Dispose();
        return ValueTask.CompletedTask;
    }
}

internal static class UnixMediaFileOperations
{
    private const int ReadOnly = 0;
    private const int WriteOnly = 1;
    private const int Directory = 0x10000;
    private const int NoFollow = 0x20000;
    private const int CloseOnExec = 0x80000;
    private const uint OwnerOnlyDirectoryMode = 0x1C0; // 0700
    private const uint OwnerOnlyFileModeValue = 0x180; // 0600
    private const uint RegularFileType = 0x8000;
    private const uint RenameExclusive = 0x4;
    private const int NotFound = 2;
    private const int AlreadyExists = 17;

    public static SafeFileHandle? OpenDirectoryTree(string absolutePath, bool createIfMissing)
    {
        EnsureSupportedPlatform();
        var fullPath = Path.GetFullPath(absolutePath);
        if (!Path.IsPathFullyQualified(fullPath))
        {
            throw new InvalidOperationException("The media root must resolve to an absolute path.");
        }

        var current = OpenDirectory("/");
        try
        {
            foreach (var component in fullPath.Split(Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries))
            {
                var next = OpenChildDirectory(current, component, createIfMissing);
                if (next is null)
                {
                    current.Dispose();
                    return null;
                }
                current.Dispose();
                current = next;
            }
            return current;
        }
        catch
        {
            current.Dispose();
            throw;
        }
    }

    public static SafeFileHandle? OpenChildDirectory(
        SafeFileHandle parent,
        string component,
        bool createIfMissing)
    {
        ValidateComponent(component);
        var descriptor = OpenAt(Descriptor(parent), component, DirectoryFlags);
        if (descriptor >= 0)
        {
            return new SafeFileHandle((IntPtr)descriptor, ownsHandle: true);
        }

        var error = Marshal.GetLastPInvokeError();
        if (error == NotFound && !createIfMissing)
        {
            return null;
        }
        if (error != NotFound)
        {
            throw FileSystemException("open directory", component, error);
        }

        if (MkdirAt(Descriptor(parent), component, OwnerOnlyDirectoryMode) != 0)
        {
            error = Marshal.GetLastPInvokeError();
            if (error != AlreadyExists)
            {
                throw FileSystemException("create directory", component, error);
            }
        }

        descriptor = OpenAt(Descriptor(parent), component, DirectoryFlags);
        if (descriptor < 0)
        {
            throw FileSystemException("open created directory", component, Marshal.GetLastPInvokeError());
        }
        return new SafeFileHandle((IntPtr)descriptor, ownsHandle: true);
    }

    public static FileStream CreateFile(SafeFileHandle directory, string fileName)
    {
        ValidateComponent(fileName);
        if (!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS())
        {
            throw new PlatformNotSupportedException(
                "Hardened local media storage requires Linux or macOS descriptor-backed file APIs.");
        }
        return OperatingSystem.IsMacOS()
            ? CreateFileMacOs(directory, fileName)
            : CreateFileLinux(directory, fileName);
    }

    private static FileStream CreateFileMacOs(SafeFileHandle directory, string fileName)
    {
        var directoryDescriptor = Descriptor(directory);
        var extension = Path.GetExtension(fileName);
        var template = new StringBuilder(
            Path.GetFileNameWithoutExtension(fileName) + "-XXXXXX" + extension,
            fileName.Length + 8);
        var descriptor = MkostempsAtMac(
            directoryDescriptor,
            template,
            extension.Length,
            CloseOnExecFlag);
        if (descriptor < 0)
        {
            throw FileSystemException("create temporary file", fileName, Marshal.GetLastPInvokeError());
        }
        var temporaryFileName = template.ToString();
        SafeFileHandle? handle = new((IntPtr)descriptor, ownsHandle: true);
        var installed = false;
        try
        {
            SetExactFileMode(handle, fileName);
            if (RenameAtExclusiveMac(
                directoryDescriptor,
                temporaryFileName,
                directoryDescriptor,
                fileName,
                RenameExclusive) != 0)
            {
                throw FileSystemException("install new file", fileName, Marshal.GetLastPInvokeError());
            }
            installed = true;
            var stream = CreateSynchronousStream(handle);
            handle = null;
            return stream;
        }
        catch
        {
            handle?.Dispose();
            DeleteFile(directory, installed ? fileName : temporaryFileName);
            throw;
        }
    }

    private static FileStream CreateFileLinux(SafeFileHandle directory, string fileName)
    {
        var directoryDescriptor = Descriptor(directory);
        if (MknodAtLinux(
            directoryDescriptor,
            fileName,
            RegularFileType | OwnerOnlyFileModeValue,
            0) != 0)
        {
            throw FileSystemException("create new file", fileName, Marshal.GetLastPInvokeError());
        }
        FileStream? stream = null;
        try
        {
            var descriptor = OpenAt(
                directoryDescriptor,
                fileName,
                WriteOnly | NoFollowFlag | CloseOnExecFlag);
            if (descriptor < 0)
            {
                throw FileSystemException("open new file", fileName, Marshal.GetLastPInvokeError());
            }
            stream = CreateSynchronousStream(new SafeFileHandle((IntPtr)descriptor, ownsHandle: true));
            SetExactFileMode(stream.SafeFileHandle, fileName);
            return stream;
        }
        catch
        {
            stream?.Dispose();
            DeleteFile(directory, fileName);
            throw;
        }
    }

    private static FileStream CreateSynchronousStream(SafeFileHandle handle) => new(
        handle,
        FileAccess.Write,
        bufferSize: 81920,
        isAsync: false);

    private static void SetExactFileMode(SafeFileHandle handle, string fileName)
    {
        if (Fchmod(Descriptor(handle), OwnerOnlyFileModeValue) != 0)
        {
            throw FileSystemException("set exact file permissions", fileName, Marshal.GetLastPInvokeError());
        }
    }

    public static void DeleteFile(SafeFileHandle directory, string fileName)
    {
        ValidateComponent(fileName);
        if (UnlinkAt(Descriptor(directory), fileName, 0) == 0)
        {
            return;
        }
        var error = Marshal.GetLastPInvokeError();
        if (error != NotFound)
        {
            throw FileSystemException("delete file", fileName, error);
        }
    }

    private static SafeFileHandle OpenDirectory(string path)
    {
        var descriptor = Open(path, DirectoryFlags);
        if (descriptor < 0)
        {
            throw FileSystemException("open directory", path, Marshal.GetLastPInvokeError());
        }
        return new SafeFileHandle((IntPtr)descriptor, ownsHandle: true);
    }

    private static int DirectoryFlags => ReadOnly | DirectoryFlag | NoFollowFlag | CloseOnExecFlag;
    private static int DirectoryFlag => OperatingSystem.IsMacOS() ? 0x100000 : Directory;
    private static int NoFollowFlag => OperatingSystem.IsMacOS() ? 0x100 : NoFollow;
    private static int CloseOnExecFlag => OperatingSystem.IsMacOS() ? 0x1000000 : CloseOnExec;

    private static int Descriptor(SafeFileHandle handle)
    {
        if (handle.IsInvalid || handle.IsClosed)
        {
            throw new ObjectDisposedException(nameof(SafeFileHandle));
        }
        return checked((int)handle.DangerousGetHandle());
    }

    private static void ValidateComponent(string component)
    {
        if (string.IsNullOrEmpty(component) || component is "." or ".." ||
            component.Contains(Path.DirectorySeparatorChar) || component.Contains(Path.AltDirectorySeparatorChar))
        {
            throw new InvalidOperationException("Media path components must be single safe names.");
        }
    }

    private static void EnsureSupportedPlatform()
    {
        if (!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS())
        {
            throw new PlatformNotSupportedException(
                "Hardened local media storage requires Linux or macOS directory-descriptor APIs.");
        }
    }

    private static IOException FileSystemException(string operation, string component, int error) =>
        new($"Failed to {operation} for hardened media component '{component}': " +
            Marshal.GetPInvokeErrorMessage(error));

    [DllImport("libc", EntryPoint = "open", SetLastError = true)]
    private static extern int Open([MarshalAs(UnmanagedType.LPUTF8Str)] string path, int flags);

    [DllImport("libc", EntryPoint = "openat", SetLastError = true)]
    private static extern int OpenAt(
        int directoryFileDescriptor,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string path,
        int flags);

    [DllImport("libc", EntryPoint = "fchmod", SetLastError = true)]
    private static extern int Fchmod(int fileDescriptor, uint mode);

    [DllImport("libc", EntryPoint = "mkostempsat_np", SetLastError = true)]
    private static extern int MkostempsAtMac(
        int directoryFileDescriptor,
        [In, Out] StringBuilder template,
        int suffixLength,
        int flags);

    [DllImport("libc", EntryPoint = "renameatx_np", SetLastError = true)]
    private static extern int RenameAtExclusiveMac(
        int fromDirectoryFileDescriptor,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string fromPath,
        int toDirectoryFileDescriptor,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string toPath,
        uint flags);

    [DllImport("libc", EntryPoint = "mknodat", SetLastError = true)]
    private static extern int MknodAtLinux(
        int directoryFileDescriptor,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string path,
        uint mode,
        ulong device);

    [DllImport("libc", EntryPoint = "mkdirat", SetLastError = true)]
    private static extern int MkdirAt(
        int directoryFileDescriptor,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string path,
        uint mode);

    [DllImport("libc", EntryPoint = "unlinkat", SetLastError = true)]
    private static extern int UnlinkAt(
        int directoryFileDescriptor,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string path,
        int flags);
}

public sealed class MediaValidationException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

public interface IMediaAssetService
{
    Task<IReadOnlyList<AdminMediaAssetResponse>> ListReadyAsync(OwnerRestaurantAccess access, CancellationToken cancellationToken);
    Task<ManagementResult<AdminMediaAssetResponse>> UploadAsync(OwnerRestaurantAccess access, string? altText, IFormFile? file, CancellationToken cancellationToken);
}

public sealed class MediaAssetService(
    MenuDbContext dbContext,
    ILocalMediaStorage storage,
    TimeProvider timeProvider,
    ILogger<MediaAssetService> logger) : IMediaAssetService
{
    public async Task<IReadOnlyList<AdminMediaAssetResponse>> ListReadyAsync(
        OwnerRestaurantAccess access,
        CancellationToken cancellationToken) => await dbContext.MediaAssets.AsNoTracking()
        .Include(item => item.Variants)
        .Where(item => item.RestaurantId == access.RestaurantId && item.ProcessingStatus == "ready")
        .OrderBy(item => item.AltText).ThenBy(item => item.Id)
        .Select(item => new AdminMediaAssetResponse(item.Id.ToString(), item.AltText, item.ProcessingStatus,
            item.Variants.OrderBy(variant => variant.Width).Select(variant =>
                new OmniRest.Api.Menus.PublicMediaVariant(variant.Url, variant.Width, variant.Height)).ToArray()))
        .ToArrayAsync(cancellationToken);

    public async Task<ManagementResult<AdminMediaAssetResponse>> UploadAsync(
        OwnerRestaurantAccess access,
        string? altText,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        var errors = RestaurantValidation.ValidateAltText(altText);
        if (file is null) errors = errors.Concat(new[] { new KeyValuePair<string, string[]>("file", ["field_required"]) }).ToDictionary();
        if (errors.Count != 0)
        {
            return ManagementResult<AdminMediaAssetResponse>.Failed(new ManagementFailure(400, "admin_validation", "Media upload is invalid", Errors: errors));
        }

        ValidatedImage image;
        try { image = await storage.ValidateAsync(file!, cancellationToken); }
        catch (MediaValidationException exception)
        {
            return ManagementResult<AdminMediaAssetResponse>.Failed(new ManagementFailure(400, "admin_validation", "Media upload is invalid", Errors: new Dictionary<string, string[]> { ["file"] = [exception.Code] }));
        }
        var id = Guid.NewGuid();
        var stored = await storage.StoreAsync(access.RestaurantId, id, image, cancellationToken);
        try
        {
            var entity = new MediaAssetEntity
            {
                Id = id,
                RestaurantId = access.RestaurantId,
                AltText = altText!.Trim(),
                ProcessingStatus = "ready"
            };
            entity.Variants.Add(new MediaVariantEntity
            {
                Id = Guid.NewGuid(),
                RestaurantId = access.RestaurantId,
                MediaAssetId = id,
                MediaAsset = entity,
                Url = stored.Url,
                Width = stored.Width,
                Height = stored.Height
            });
            dbContext.MediaAssets.Add(entity);
            dbContext.AuditEvents.Add(new AuditEventEntity
            {
                Id = Guid.NewGuid(),
                RestaurantId = access.RestaurantId,
                ActorUserId = access.UserId,
                Action = "media.uploaded",
                EntityType = "media_asset",
                EntityVersion = "1",
                OccurredAt = timeProvider.GetUtcNow()
            });
            await dbContext.SaveChangesAsync(cancellationToken);
            return ManagementResult<AdminMediaAssetResponse>.Success(new AdminMediaAssetResponse(
                id.ToString(), entity.AltText, entity.ProcessingStatus,
                [new OmniRest.Api.Menus.PublicMediaVariant(stored.Url, stored.Width, stored.Height)]));
        }
        catch (Exception persistenceException)
        {
            dbContext.ChangeTracker.Clear();
            try
            {
                await stored.CompensateAsync(CancellationToken.None);
            }
            catch (Exception cleanupException)
            {
                logger.LogCritical(
                    cleanupException,
                    "Media blob compensation failed for asset {MediaAssetId} in restaurant {RestaurantId}.",
                    id,
                    access.RestaurantId);
                throw new AggregateException(
                    "Media persistence and exact-blob compensation both failed.",
                    persistenceException,
                    cleanupException);
            }
            throw;
        }
        finally
        {
            await stored.DisposeAsync();
        }
    }
}
