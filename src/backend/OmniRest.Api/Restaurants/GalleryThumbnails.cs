using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;

namespace OmniRest.Api.Restaurants;

public sealed record GalleryThumbnail(byte[] Bytes, int Width, int Height, bool ReusedSource);

/// <summary>
/// Produces the gallery thumbnail blob. Kept behind an interface so ordering and storage behaviour can be
/// exercised without the filesystem, and so the resize rules can be tested on in-memory images alone.
/// </summary>
public interface IGalleryThumbnailFactory
{
    Task<GalleryThumbnail> CreateAsync(ValidatedImage source, CancellationToken cancellationToken);
}

public sealed class GalleryThumbnailFactory : IGalleryThumbnailFactory
{
    /// <summary>Longest edge of a gallery thumbnail (pr-16 section 2).</summary>
    public const int MaximumEdge = 480;

    public async Task<GalleryThumbnail> CreateAsync(ValidatedImage source, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(source);

        // Never upscale: a source already inside the box is reused byte-for-byte instead of re-encoded.
        if (source.Width <= MaximumEdge && source.Height <= MaximumEdge)
        {
            return new GalleryThumbnail(source.Bytes, source.Width, source.Height, ReusedSource: true);
        }

        using var image = Image.Load(source.Bytes);
        var format = image.Metadata.DecodedImageFormat
            ?? throw new InvalidOperationException("A validated gallery image must carry a decoded format.");
        image.Mutate(context => context.Resize(new ResizeOptions
        {
            Size = new Size(MaximumEdge, MaximumEdge),
            Mode = ResizeMode.Max
        }));

        using var buffer = new MemoryStream();
        var encoder = image.Configuration.ImageFormatsManager.GetEncoder(format);
        await image.SaveAsync(buffer, encoder, cancellationToken);
        return new GalleryThumbnail(buffer.ToArray(), image.Width, image.Height, ReusedSource: false);
    }
}
