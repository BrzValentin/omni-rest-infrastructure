using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OmniRest.Api.Data;
using OmniRest.Api.Restaurants;
using OmniRest.Api.Security;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;

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

    /// <summary>
    /// PR-23: an upload now yields the whole responsive ladder rather than a single full-size blob. These
    /// widths are the contract the public projection orders by and the frontend's srcset picks from, so
    /// they are asserted exactly rather than by count.
    /// </summary>
    [Fact]
    public async Task ALargeUploadPersistsTheWholeResponsiveLadderAsMediaVariantRows()
    {
        var storage = new LadderRecordingStorage();

        var (response, variants) = await UploadWithSuppressedPersistenceAsync(storage, CreateImage(2000, 1200));

        var ordered = variants.OrderBy(item => item.Width).ToArray();
        Assert.Equal([480, 960, 1600, 2000], ordered.Select(item => item.Width).ToArray());
        Assert.Equal([288, 576, 960, 1200], ordered.Select(item => item.Height).ToArray());
        Assert.Equal([480, 960, 1600, 2000], response.Variants.Select(item => item.Width).ToArray());

        // Every rung is a separate blob under its own storage key: a ladder that collided on one name
        // would silently publish four variant rows pointing at a single file.
        Assert.Equal(4, storage.Written.Count);
        Assert.Equal(4, variants.Select(item => item.StorageKey).Distinct(StringComparer.Ordinal).Count());
        Assert.Equal(4, variants.Select(item => item.Url).Distinct(StringComparer.Ordinal).Count());
        Assert.All(variants, item => Assert.Equal(response.Id, item.MediaAssetId.ToString()));

        // Each row records the bytes written for its own rung, not the original's, which is what makes the
        // ladder worth storing at all.
        var sizes = ordered.Select(item => item.FileSizeBytes).ToArray();
        Assert.All(sizes, size => Assert.True(size > 0));
        Assert.True(
            sizes[0] < sizes[^1],
            $"Expected the smallest rung to be the smallest blob but sizes were [{string.Join(", ", sizes)}].");
    }

    /// <summary>
    /// The no-upscale rule already proven for <see cref="GalleryThumbnailFactory"/>, now on the responsive
    /// ladder: a source below the smallest rung is stored once, byte-for-byte, under the media asset's own
    /// name rather than re-encoded into a larger label.
    /// </summary>
    [Fact]
    public async Task AnImageSmallerThanTheSmallestRungIsStoredOnceAndReusesTheSourceBytes()
    {
        var storage = new LadderRecordingStorage();
        var source = CreateImage(320, 200);

        var (response, variants) = await UploadWithSuppressedPersistenceAsync(storage, source);

        var variant = Assert.Single(variants);
        Assert.Equal((320, 200), (variant.Width, variant.Height));
        Assert.Equal(source.LongLength, variant.FileSizeBytes);
        var written = Assert.Single(storage.Written);
        Assert.Equal(source, written.Bytes);
        Assert.Equal(Guid.Parse(response.Id), written.Seed);
        Assert.Equal((320, 200), (response.Variants.Single().Width, response.Variants.Single().Height));
    }

    /// <summary>
    /// The ladder itself, on in-memory images: only rungs strictly below the source are produced, they are
    /// ordered ascending and never duplicated, and the source is always the widest rung so an asset stored
    /// before the ladder existed and one stored after it project identically.
    /// </summary>
    [Theory]
    [InlineData(2000, 1200, 4)]
    [InlineData(1000, 1000, 3)]
    [InlineData(700, 400, 2)]
    [InlineData(480, 480, 1)]
    [InlineData(300, 200, 1)]
    [InlineData(1, 1, 1)]
    public async Task TheResponsiveLadderOnlyAddsRungsBelowTheSourceAndAlwaysEndsWithTheOriginal(
        int width, int height, int expectedRungs)
    {
        var bytes = CreateImage(width, height);
        var source = new ValidatedImage(bytes, ".png", "image/png", width, height);

        var ladder = await new ResponsiveImageVariantFactory().CreateAsync(source, CancellationToken.None);

        Assert.Equal(expectedRungs, ladder.Count);
        var edges = ladder.Select(item => Math.Max(item.Width, item.Height)).ToArray();
        Assert.Equal(edges.OrderBy(edge => edge).ToArray(), edges);
        Assert.Equal(edges.Length, edges.Distinct().Count());
        Assert.All(edges, edge => Assert.True(edge <= Math.Max(width, height), $"Rung {edge} upscaled past the source."));

        var widest = ladder[^1];
        Assert.True(widest.ReusedSource);
        Assert.Same(source.Bytes, widest.Bytes);
        Assert.Equal((width, height), (widest.Width, widest.Height));
        Assert.Single(ladder, item => item.ReusedSource);

        foreach (var derived in ladder.Take(ladder.Count - 1))
        {
            using var decoded = Image.Load(derived.Bytes);
            Assert.Equal((derived.Width, derived.Height), (decoded.Width, decoded.Height));
            Assert.Equal("image/png", decoded.Metadata.DecodedImageFormat?.DefaultMimeType);
            Assert.True(
                Math.Abs((double)derived.Width / derived.Height - (double)width / height) < 0.01,
                $"Rung {derived.Width}x{derived.Height} did not preserve the {width}x{height} aspect ratio.");
        }
    }

    /// <summary>
    /// Runs a real upload through <see cref="MediaAssetService"/> with the database write suppressed, so the
    /// <see cref="MediaVariantEntity"/> rows the service builds can be inspected without a live PostgreSQL.
    /// </summary>
    private static async Task<(AdminMediaAssetResponse Response, IReadOnlyList<MediaVariantEntity> Variants)>
        UploadWithSuppressedPersistenceAsync(LadderRecordingStorage storage, byte[] png)
    {
        var capture = new SuppressingSaveChangesInterceptor();
        var options = new DbContextOptionsBuilder<MenuDbContext>()
            .UseNpgsql("Host=127.0.0.1;Port=1;Database=unused;Username=unused;Password=unused")
            .AddInterceptors(capture)
            .Options;
        await using var dbContext = new MenuDbContext(options);
        var service = new MediaAssetService(
            dbContext,
            storage,
            new ResponsiveImageVariantFactory(),
            TimeProvider.System,
            NullLogger<MediaAssetService>.Instance);
        await using var stream = new MemoryStream(png);
        var file = new FormFile(stream, 0, png.Length, "file", "image.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };
        var access = new OwnerRestaurantAccess(Guid.NewGuid(), Guid.NewGuid(), MembershipRoles.Owner);

        var result = await service.UploadAsync(access, "Responsive dining room", file, CancellationToken.None);

        Assert.Null(result.Failure);
        Assert.NotNull(result.Value);
        return (result.Value, capture.Variants);
    }

    private static byte[] CreateImage(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x++)
                {
                    row[x] = new Rgba32((byte)(x * 7 % 256), (byte)(y * 13 % 256), 128, 255);
                }
            }
        });

        using var buffer = new MemoryStream();
        image.Save(buffer, new PngEncoder());
        return buffer.ToArray();
    }

    /// <summary>
    /// Validates with the shipped ImageSharp rules but records stores in memory, because the real storage
    /// writes through Unix libc P/Invoke and this test is only about which rungs are produced.
    /// </summary>
    private sealed class LadderRecordingStorage : ILocalMediaStorage
    {
        private readonly LocalMediaStorage validator = new(Options.Create(new LocalMediaStorageOptions
        {
            LocalRoot = Path.Combine(Path.GetTempPath(), "omni-rest-unused-media-root"),
            MaximumBytes = 32L * 1024 * 1024
        }));

        public List<(Guid Seed, byte[] Bytes, int Width, int Height)> Written { get; } = [];

        public Task<ValidatedImage> ValidateAsync(IFormFile file, CancellationToken cancellationToken) =>
            validator.ValidateAsync(file, cancellationToken);

        public Task<StoredMedia> StoreAsync(
            Guid restaurantId,
            Guid mediaAssetId,
            ValidatedImage image,
            CancellationToken cancellationToken)
        {
            Written.Add((mediaAssetId, image.Bytes, image.Width, image.Height));
            return Task.FromResult(new StoredMedia(
                $"/media/uploads/{restaurantId:N}/{mediaAssetId:N}{image.Extension}", image.Width, image.Height));
        }

        public Task DeleteAsync(
            Guid restaurantId,
            Guid mediaAssetId,
            string extension,
            CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed class SuppressingSaveChangesInterceptor : SaveChangesInterceptor
    {
        public List<MediaVariantEntity> Variants { get; } = [];

        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            Variants.AddRange(eventData.Context!.ChangeTracker
                .Entries<MediaVariantEntity>()
                .Select(entry => entry.Entity));
            return ValueTask.FromResult(InterceptionResult<int>.SuppressWithResult(0));
        }
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
            new ResponsiveImageVariantFactory(),
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
