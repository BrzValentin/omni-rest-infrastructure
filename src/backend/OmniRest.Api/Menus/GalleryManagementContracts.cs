using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Menus;

public sealed record UpdateGalleryImageRequest(string AltText, string? Caption, bool IsActive);

public sealed record ReorderGalleryImagesRequest(IReadOnlyList<Guid> ImageIds);

public sealed record AdminGalleryImageResponse(
    string Id,
    string MediaAssetId,
    string AltText,
    string? Caption,
    int DisplayOrder,
    bool IsActive,
    string ImageUrl,
    string ThumbnailUrl,
    int Width,
    int Height,
    long? FileSizeBytes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record AdminGalleryResponse(
    IReadOnlyList<AdminGalleryImageResponse> Images,
    int MaximumImages,
    string DraftVersion,
    string ETag,
    PublicationStatusResponse? PublicationStatus);

public sealed record AdminGalleryMutationResponse(
    AdminGalleryResponse Gallery,
    PublicationStatusResponse Publication);
