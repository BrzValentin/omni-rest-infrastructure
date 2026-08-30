using Microsoft.AspNetCore.Http;
using OmniRest.Api.Restaurants;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.PixelFormats;

namespace OmniRest.Api.Tests.Unit;

/// <summary>
/// Thumbnail sizing is exercised entirely on in-memory ImageSharp images and a fake
/// <see cref="ILocalMediaStorage"/>, because the shipped storage writes through Unix libc P/Invoke and
/// throws <see cref="PlatformNotSupportedException"/> on Windows.
/// </summary>
public sealed class GalleryThumbnailTests
{
    private static readonly GalleryThumbnailFactory Factory = new();

    [Theory]
    [InlineData(1600, 900, 480, 270)]   // landscape
    [InlineData(900, 1600, 270, 480)]   // portrait
    [InlineData(1200, 1200, 480, 480)]  // square
    [InlineData(960, 480, 480, 240)]    // only the long edge exceeds the box
    public async Task LongestEdgeIsCappedAtFourHundredEightyAndAspectIsPreserved(
        int width, int height, int expectedWidth, int expectedHeight)
    {
        var source = CreateImage(width, height, new PngEncoder(), ".png", "image/png");

        var thumbnail = await Factory.CreateAsync(source, CancellationToken.None);

        Assert.False(thumbnail.ReusedSource);
        Assert.Equal(expectedWidth, thumbnail.Width);
        Assert.Equal(expectedHeight, thumbnail.Height);
        Assert.Equal(GalleryThumbnailFactory.MaximumEdge, Math.Max(thumbnail.Width, thumbnail.Height));

        using var decoded = Image.Load(thumbnail.Bytes);
        Assert.Equal(thumbnail.Width, decoded.Width);
        Assert.Equal(thumbnail.Height, decoded.Height);
    }

    [Theory]
    [InlineData(480, 480)]
    [InlineData(200, 120)]
    [InlineData(1, 1)]
    public async Task AlreadySmallSourcesAreReusedAndNeverUpscaled(int width, int height)
    {
        var source = CreateImage(width, height, new PngEncoder(), ".png", "image/png");

        var thumbnail = await Factory.CreateAsync(source, CancellationToken.None);

        Assert.True(thumbnail.ReusedSource);
        Assert.Equal(width, thumbnail.Width);
        Assert.Equal(height, thumbnail.Height);
        Assert.Same(source.Bytes, thumbnail.Bytes);
    }

    [Fact]
    public async Task ThumbnailIsReEncodedInTheSourceFormat()
    {
        var source = CreateImage(1000, 500, new WebpEncoder(), ".webp", "image/webp");

        var thumbnail = await Factory.CreateAsync(source, CancellationToken.None);

        var info = Image.Identify(thumbnail.Bytes);
        Assert.Equal("image/webp", info.Metadata.DecodedImageFormat?.DefaultMimeType);
    }

    [Fact]
    public async Task OriginalAndThumbnailAreStoredUnderSeparateSeedsSoTheBlobsNeverCollide()
    {
        var storage = new FakeLocalMediaStorage();
        var restaurantId = Guid.NewGuid();
        var mediaAssetId = Guid.NewGuid();
        var thumbnailSeed = Guid.NewGuid();
        var source = CreateImage(1000, 500, new PngEncoder(), ".png", "image/png");
        var thumbnail = await Factory.CreateAsync(source, CancellationToken.None);

        var storedOriginal = await storage.StoreAsync(restaurantId, mediaAssetId, source, CancellationToken.None);
        var storedThumbnail = await storage.StoreAsync(
            restaurantId,
            thumbnailSeed,
            new ValidatedImage(thumbnail.Bytes, source.Extension, source.ContentType, thumbnail.Width, thumbnail.Height),
            CancellationToken.None);

        Assert.Equal(2, storage.Written.Count);
        Assert.NotEqual(storedOriginal.Url, storedThumbnail.Url);
        Assert.Equal((1000, 500), (storedOriginal.Width, storedOriginal.Height));
        Assert.Equal((480, 240), (storedThumbnail.Width, storedThumbnail.Height));
        Assert.True(storage.Written[$"{restaurantId:N}/{thumbnailSeed:N}.png"].Length <
            storage.Written[$"{restaurantId:N}/{mediaAssetId:N}.png"].Length);
    }

    private static ValidatedImage CreateImage(
        int width,
        int height,
        SixLabors.ImageSharp.Formats.IImageEncoder encoder,
        string extension,
        string contentType)
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
        image.Save(buffer, encoder);
        return new ValidatedImage(buffer.ToArray(), extension, contentType, width, height);
    }

    private sealed class FakeLocalMediaStorage : ILocalMediaStorage
    {
        public Dictionary<string, byte[]> Written { get; } = new(StringComparer.Ordinal);

        public Task<ValidatedImage> ValidateAsync(IFormFile file, CancellationToken cancellationToken) =>
            throw new NotSupportedException("The fake storage is only used for store and delete.");

        public Task<StoredMedia> StoreAsync(
            Guid restaurantId,
            Guid mediaAssetId,
            ValidatedImage image,
            CancellationToken cancellationToken)
        {
            var key = $"{restaurantId:N}/{mediaAssetId:N}{image.Extension}";
            Written[key] = image.Bytes;
            return Task.FromResult(new StoredMedia($"/media/uploads/{key}", image.Width, image.Height));
        }

        public Task DeleteAsync(
            Guid restaurantId,
            Guid mediaAssetId,
            string extension,
            CancellationToken cancellationToken)
        {
            Written.Remove($"{restaurantId:N}/{mediaAssetId:N}{extension}");
            return Task.CompletedTask;
        }
    }
}
