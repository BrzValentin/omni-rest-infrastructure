using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;

namespace OmniRest.Api.Restaurants;

/// <summary>
/// One rung of the responsive ladder. <paramref name="ReusedSource"/> marks the rung that is the
/// uploaded bytes themselves, so the caller can store it under the media asset's own name and skip a
/// re-encode.
/// </summary>
public sealed record ResponsiveImageVariant(byte[] Bytes, int Width, int Height, bool ReusedSource);

/// <summary>
/// Builds the responsive set a dish or restaurant image is published with (PR-23). Behind an interface
/// for the same reason the gallery thumbnail factory is: the sizing rules are worth testing on in-memory
/// images, without the Unix-descriptor storage the shipped uploader writes through.
/// </summary>
public interface IResponsiveImageVariantFactory
{
    Task<IReadOnlyList<ResponsiveImageVariant>> CreateAsync(ValidatedImage source, CancellationToken cancellationToken);
}

public sealed class ResponsiveImageVariantFactory : IResponsiveImageVariantFactory
{
    /// <summary>
    /// Longest-edge rungs, ascending. Chosen to cover a phone, a laptop, and a retina hero without
    /// multiplying storage: the frontend already picks the widest variant it can use, and
    /// <c>PublicMedia.Variants</c> is a list, so this is purely additive on the read side.
    /// </summary>
    public static readonly IReadOnlyList<int> Ladder = [480, 960, 1600];

    public async Task<IReadOnlyList<ResponsiveImageVariant>> CreateAsync(
        ValidatedImage source,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(source);

        var longestEdge = Math.Max(source.Width, source.Height);
        var results = new List<ResponsiveImageVariant>();
        var seen = new HashSet<(int Width, int Height)>();

        foreach (var edge in Ladder)
        {
            // Never upscale: a rung at or above the source's longest edge would only re-encode the same
            // pixels under a larger label, and the source itself is added below as the widest variant.
            if (edge >= longestEdge)
            {
                continue;
            }

            var resized = await ResizeAsync(source, edge, cancellationToken);
            if (seen.Add((resized.Width, resized.Height)))
            {
                results.Add(resized);
            }
        }

        // The upload always keeps its full-size original as the widest rung, so an asset selected before
        // this change and one uploaded after it project the same way: widest last.
        if (seen.Add((source.Width, source.Height)))
        {
            results.Add(new ResponsiveImageVariant(source.Bytes, source.Width, source.Height, ReusedSource: true));
        }
        return results;
    }

    private static async Task<ResponsiveImageVariant> ResizeAsync(
        ValidatedImage source,
        int longestEdge,
        CancellationToken cancellationToken)
    {
        using var image = Image.Load(source.Bytes);
        var format = image.Metadata.DecodedImageFormat
            ?? throw new InvalidOperationException("A validated image must carry a decoded format.");
        image.Mutate(context => context.Resize(new ResizeOptions
        {
            Size = new Size(longestEdge, longestEdge),
            Mode = ResizeMode.Max
        }));

        using var buffer = new MemoryStream();
        var encoder = image.Configuration.ImageFormatsManager.GetEncoder(format);
        await image.SaveAsync(buffer, encoder, cancellationToken);
        return new ResponsiveImageVariant(buffer.ToArray(), image.Width, image.Height, ReusedSource: false);
    }
}
