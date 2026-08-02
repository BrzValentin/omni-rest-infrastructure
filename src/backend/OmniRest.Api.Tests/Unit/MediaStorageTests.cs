using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OmniRest.Api.Data;
using OmniRest.Api.Restaurants;
using OmniRest.Api.Security;

namespace OmniRest.Api.Tests.Unit;

public sealed class MediaStorageTests
{
    private static readonly byte[] Png = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");

    [Fact]
    public async Task DatabaseFailureAfterBlobWriteDeletesOnlyTheExactRandomizedBlob()
    {
        var failure = new DbUpdateException("Injected persistence failure.");
        var thrown = await AssertCompensatesAsync(failure, CancellationToken.None);
        Assert.Same(failure, thrown);
    }

    [Fact]
    public async Task DatabaseCancellationAfterBlobWriteDeletesOnlyTheExactRandomizedBlob()
    {
        using var source = new CancellationTokenSource();
        var failure = new OperationCanceledException(source.Token);
        var thrown = await AssertCompensatesAsync(failure, source.Token, () => source.Cancel());

        Assert.Same(failure, thrown);
        Assert.True(source.IsCancellationRequested);
    }

    [Fact]
    public async Task StoreRejectsSymlinkedTenantDirectoryWithoutTouchingOutsideSentinel()
    {
        using var sandbox = new MediaSandbox();
        var restaurantId = Guid.NewGuid();
        var mediaAssetId = Guid.NewGuid();
        sandbox.CreateTenantSymlink(restaurantId);

        await Assert.ThrowsAsync<IOException>(() => CreateStorage(sandbox.Root).StoreAsync(
            restaurantId,
            mediaAssetId,
            ValidImage(),
            CancellationToken.None));

        sandbox.AssertOutsideSentinelUntouched();
        Assert.False(File.Exists(Path.Combine(sandbox.Outside, mediaAssetId.ToString("N") + ".png")));
    }

    [Fact]
    public async Task DeleteRejectsSymlinkedTenantDirectoryWithoutTouchingExactOutsideFile()
    {
        using var sandbox = new MediaSandbox();
        var restaurantId = Guid.NewGuid();
        var mediaAssetId = Guid.NewGuid();
        var outsideTarget = Path.Combine(sandbox.Outside, mediaAssetId.ToString("N") + ".png");
        await File.WriteAllTextAsync(outsideTarget, "outside exact-name sentinel");
        sandbox.CreateTenantSymlink(restaurantId);

        await Assert.ThrowsAsync<IOException>(() => CreateStorage(sandbox.Root).DeleteAsync(
            restaurantId,
            mediaAssetId,
            ".png",
            CancellationToken.None));

        sandbox.AssertOutsideSentinelUntouched();
        Assert.Equal("outside exact-name sentinel", await File.ReadAllTextAsync(outsideTarget));
    }

    [Fact]
    public async Task RepeatedCreatesHaveExactModeReadableBytesStableDescriptorsAndNoLinkEscape()
    {
        using var sandbox = new MediaSandbox();
        var storage = CreateStorage(sandbox.Root);
        var restaurantId = Guid.NewGuid();

        var warmupId = Guid.NewGuid();
        await using (var warmup = await storage.StoreAsync(
            restaurantId, warmupId, ValidImage(), CancellationToken.None))
        {
            AssertStoredFile(sandbox.TenantPath(restaurantId), warmupId);
        }
        await storage.DeleteAsync(restaurantId, warmupId, ".png", CancellationToken.None);
        var descriptorsBefore = CountOpenFileDescriptors();

        for (var index = 0; index < 96; index++)
        {
            var mediaAssetId = Guid.NewGuid();
            await using var stored = await storage.StoreAsync(
                restaurantId, mediaAssetId, ValidImage(), CancellationToken.None);
            AssertStoredFile(sandbox.TenantPath(restaurantId), mediaAssetId);
        }

        Assert.Equal(descriptorsBefore, CountOpenFileDescriptors());

        var originalTenant = sandbox.TenantPath(restaurantId) + "-original";
        Directory.Move(sandbox.TenantPath(restaurantId), originalTenant);
        sandbox.CreateTenantSymlink(restaurantId);
        var escapedId = Guid.NewGuid();
        await Assert.ThrowsAsync<IOException>(() => storage.StoreAsync(
            restaurantId, escapedId, ValidImage(), CancellationToken.None));
        Assert.False(File.Exists(Path.Combine(sandbox.Outside, escapedId.ToString("N") + ".png")));
        sandbox.AssertOutsideSentinelUntouched();
    }

    [Fact]
    public async Task CreateNewCollisionNeverOverwritesExistingBlobOrLeavesTemporaryFiles()
    {
        using var sandbox = new MediaSandbox();
        var storage = CreateStorage(sandbox.Root);
        var restaurantId = Guid.NewGuid();
        var mediaAssetId = Guid.NewGuid();

        await using (var stored = await storage.StoreAsync(
            restaurantId, mediaAssetId, ValidImage(), CancellationToken.None))
        {
            AssertStoredFile(sandbox.TenantPath(restaurantId), mediaAssetId);
        }

        await Assert.ThrowsAsync<IOException>(() => storage.StoreAsync(
            restaurantId,
            mediaAssetId,
            new ValidatedImage([1, 2, 3], ".png", "image/png", 1, 1),
            CancellationToken.None));

        AssertStoredFile(sandbox.TenantPath(restaurantId), mediaAssetId);
        Assert.Equal(
            [Path.Combine(sandbox.TenantPath(restaurantId), mediaAssetId.ToString("N") + ".png")],
            Directory.GetFiles(sandbox.TenantPath(restaurantId)));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task PersistenceCompensationUsesOriginalTenantHandleAfterDirectoryLinkSwap(bool cancellation)
    {
        using var sandbox = new MediaSandbox();
        using var source = new CancellationTokenSource();
        var restaurantId = Guid.NewGuid();
        var originalTenant = sandbox.TenantPath(restaurantId) + "-original";
        Guid storedAssetId = default;
        string? outsideTarget = null;
        Exception failure = cancellation
            ? new OperationCanceledException(source.Token)
            : new DbUpdateException("Injected persistence failure after tenant swap.");
        void SwapBeforeFailure(DbContext? context)
        {
            storedAssetId = Assert.Single(((MenuDbContext)context!).MediaAssets.Local).Id;
            Directory.Move(sandbox.TenantPath(restaurantId), originalTenant);
            sandbox.CreateTenantSymlink(restaurantId);
            outsideTarget = Path.Combine(sandbox.Outside, storedAssetId.ToString("N") + ".png");
            File.WriteAllText(outsideTarget, "outside exact-name sentinel");
            if (cancellation)
            {
                source.Cancel();
            }
        }

        var thrown = await UploadWithInjectedPersistenceFailureAsync(
            sandbox.Root,
            restaurantId,
            failure,
            source.Token,
            SwapBeforeFailure);

        Assert.Same(failure, thrown);
        Assert.NotEqual(Guid.Empty, storedAssetId);
        Assert.Empty(Directory.GetFiles(originalTenant));
        Assert.NotNull(outsideTarget);
        Assert.Equal("outside exact-name sentinel", await File.ReadAllTextAsync(outsideTarget));
        sandbox.AssertOutsideSentinelUntouched();
        Assert.Equal(cancellation, source.IsCancellationRequested);
    }

    [Fact]
    public async Task DeleteRejectsTraversalLikeExtensionsWithoutTouchingOtherFiles()
    {
        using var sandbox = new MediaSandbox();
        var storage = CreateStorage(sandbox.Root);
        var restaurantId = Guid.NewGuid();
        var directory = sandbox.TenantPath(restaurantId);
        Directory.CreateDirectory(directory);
        var decoy = Path.Combine(directory, "keep.txt");
        await File.WriteAllTextAsync(decoy, "keep");

        await Assert.ThrowsAsync<InvalidOperationException>(() => storage.DeleteAsync(
            restaurantId, Guid.NewGuid(), "/../../keep.txt", CancellationToken.None));

        Assert.True(File.Exists(decoy));
        sandbox.AssertOutsideSentinelUntouched();
    }

    private static async Task<Exception> AssertCompensatesAsync(
        Exception failure,
        CancellationToken cancellationToken,
        Action? beforeFailure = null)
    {
        using var sandbox = new MediaSandbox();
        var restaurantId = Guid.NewGuid();
        var directory = sandbox.TenantPath(restaurantId);
        Directory.CreateDirectory(directory);
        var decoy = Path.Combine(directory, "preexisting.bin");
        await File.WriteAllTextAsync(decoy, "preserve");

        var thrown = await UploadWithInjectedPersistenceFailureAsync(
            sandbox.Root,
            restaurantId,
            failure,
            cancellationToken,
            _ => beforeFailure?.Invoke());

        Assert.True(File.Exists(decoy));
        Assert.Equal([decoy], Directory.GetFiles(directory));
        sandbox.AssertOutsideSentinelUntouched();
        return thrown;
    }

    private static async Task<Exception> UploadWithInjectedPersistenceFailureAsync(
        string root,
        Guid restaurantId,
        Exception failure,
        CancellationToken cancellationToken,
        Action<DbContext?>? beforeFailure)
    {
        var options = new DbContextOptionsBuilder<MenuDbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=unused;Username=unused;Password=unused")
            .AddInterceptors(new FailingSaveChangesInterceptor(failure, beforeFailure))
            .Options;
        await using var dbContext = new MenuDbContext(options);
        var service = new MediaAssetService(
            dbContext,
            CreateStorage(root),
            TimeProvider.System,
            NullLogger<MediaAssetService>.Instance);
        await using var stream = new MemoryStream(Png);
        var file = new FormFile(stream, 0, Png.Length, "file", "image.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };
        var access = new OwnerRestaurantAccess(Guid.NewGuid(), restaurantId, MembershipRoles.Owner);

        var thrown = await Assert.ThrowsAnyAsync<Exception>(() => service.UploadAsync(
            access, "Compensated image", file, cancellationToken));

        Assert.Empty(dbContext.ChangeTracker.Entries());
        return thrown;
    }

    private static ValidatedImage ValidImage() => new(Png, ".png", "image/png", 1, 1);

    private static void AssertStoredFile(string tenantPath, Guid mediaAssetId)
    {
        var path = Path.Combine(tenantPath, mediaAssetId.ToString("N") + ".png");
        Assert.Equal(Png, File.ReadAllBytes(path));
        UnixFileMode mode;
        if (OperatingSystem.IsLinux())
        {
            mode = File.GetUnixFileMode(path);
        }
        else if (OperatingSystem.IsMacOS())
        {
            mode = File.GetUnixFileMode(path);
        }
        else
        {
            throw new PlatformNotSupportedException("Unix media tests require Linux or macOS.");
        }
        Assert.Equal(
            UnixFileMode.UserRead | UnixFileMode.UserWrite,
            mode);
    }

    private static int CountOpenFileDescriptors() => Directory.EnumerateFileSystemEntries(
        OperatingSystem.IsMacOS() ? "/dev/fd" : "/proc/self/fd").Count();

    private static LocalMediaStorage CreateStorage(string root) => new(Options.Create(new LocalMediaStorageOptions
    {
        LocalRoot = root
    }));

    private sealed class FailingSaveChangesInterceptor(
        Exception failure,
        Action<DbContext?>? beforeFailure) : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            beforeFailure?.Invoke(eventData.Context);
            return ValueTask.FromException<InterceptionResult<int>>(failure);
        }
    }

    private sealed class MediaSandbox : IDisposable
    {
        private static readonly string TestRoot = Path.Combine(CanonicalTemporaryDirectory(), "omni-rest-media-test");
        private readonly List<string> links = [];

        public MediaSandbox()
        {
            Base = Path.Combine(TestRoot, Guid.NewGuid().ToString("N"));
            Root = Path.Combine(Base, "media-root");
            Outside = Path.Combine(Base, "outside-root");
            Directory.CreateDirectory(Root);
            Directory.CreateDirectory(Outside);
            OutsideSentinel = Path.Combine(Outside, "outside-sentinel.txt");
            File.WriteAllText(OutsideSentinel, "outside sentinel");
            Assert.False(IsWithin(Outside, Root));
        }

        public string Base { get; }
        public string Root { get; }
        public string Outside { get; }
        public string OutsideSentinel { get; }

        public string TenantPath(Guid restaurantId) => Path.Combine(Root, restaurantId.ToString("N"));

        public void CreateTenantSymlink(Guid restaurantId)
        {
            var path = TenantPath(restaurantId);
            Directory.CreateSymbolicLink(path, Outside);
            links.Add(path);
        }

        public void AssertOutsideSentinelUntouched() =>
            Assert.Equal("outside sentinel", File.ReadAllText(OutsideSentinel));

        public void Dispose()
        {
            AssertOutsideSentinelUntouched();
            foreach (var link in links.Where(Directory.Exists))
            {
                Directory.Delete(link);
            }

            var fullBase = Path.GetFullPath(Base);
            if (!IsWithin(fullBase, TestRoot) || string.Equals(fullBase, TestRoot, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Refusing to clean a path outside the isolated media-test root.");
            }
            Directory.Delete(fullBase, recursive: true);
        }

        private static bool IsWithin(string candidate, string parent) =>
            Path.GetFullPath(candidate).StartsWith(
                Path.GetFullPath(parent).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar,
                StringComparison.Ordinal);

        private static string CanonicalTemporaryDirectory()
        {
            var temporaryDirectory = Path.GetFullPath(Path.GetTempPath())
                .TrimEnd(Path.DirectorySeparatorChar);
            if (!OperatingSystem.IsMacOS())
            {
                return temporaryDirectory;
            }
            if (string.Equals(temporaryDirectory, "/tmp", StringComparison.Ordinal) ||
                temporaryDirectory.StartsWith("/var/", StringComparison.Ordinal))
            {
                return "/private" + temporaryDirectory;
            }
            return temporaryDirectory;
        }
    }
}
