using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using OmniRest.Api.Data;
using OmniRest.Api.Menus;
using OmniRest.Api.Security;

namespace OmniRest.Api.Restaurants;

public interface IGalleryManagementService
{
    Task<ManagementResult<AdminGalleryResponse>> ReadGalleryAsync(
        OwnerRestaurantAccess access, CancellationToken cancellationToken);

    Task<ManagementResult<AdminGalleryMutationResponse>> UploadImageAsync(
        OwnerRestaurantAccess access, string? etag, string? altText, string? caption,
        IFormFile? file, CancellationToken cancellationToken);

    Task<ManagementResult<AdminGalleryMutationResponse>> UpdateImageAsync(
        OwnerRestaurantAccess access, Guid imageId, string? etag,
        UpdateGalleryImageRequest request, CancellationToken cancellationToken);

    Task<ManagementResult<AdminGalleryMutationResponse>> DeleteImageAsync(
        OwnerRestaurantAccess access, Guid imageId, string? etag, CancellationToken cancellationToken);

    Task<ManagementResult<AdminGalleryMutationResponse>> ReorderImagesAsync(
        OwnerRestaurantAccess access, string? etag,
        ReorderGalleryImagesRequest request, CancellationToken cancellationToken);
}

/// <summary>
/// Identifies one stored gallery blob well enough to delete it after a successful commit.
/// </summary>
internal sealed record GalleryBlobReference(Guid RestaurantId, Guid FileNameSeed, string Extension);

/// <summary>
/// <c>{restaurantId:N}/{fileNameSeed}{extension}</c> — the relative blob identity persisted on
/// <c>media_variants.storage_key</c>.
/// </summary>
internal static class GalleryStorageKey
{
    public static string Create(Guid restaurantId, Guid fileNameSeed, string extension) =>
        $"{restaurantId:N}/{fileNameSeed:N}{extension}";

    public static bool TryParse(string? value, [NotNullWhen(true)] out GalleryBlobReference? reference)
    {
        reference = null;
        if (value is null)
        {
            return false;
        }
        var separator = value.IndexOf('/', StringComparison.Ordinal);
        if (separator <= 0 || separator == value.Length - 1)
        {
            return false;
        }
        if (!Guid.TryParseExact(value[..separator], "N", out var restaurantId))
        {
            return false;
        }
        var fileName = value[(separator + 1)..];
        var extensionStart = fileName.IndexOf('.', StringComparison.Ordinal);
        if (extensionStart <= 0 ||
            !Guid.TryParseExact(fileName[..extensionStart], "N", out var fileNameSeed))
        {
            return false;
        }
        reference = new GalleryBlobReference(restaurantId, fileNameSeed, fileName[extensionStart..]);
        return true;
    }
}

public sealed partial class RestaurantManagementService : IGalleryManagementService
{
    public async Task<ManagementResult<AdminGalleryResponse>> ReadGalleryAsync(
        OwnerRestaurantAccess access,
        CancellationToken cancellationToken)
    {
        var restaurant = await LoadAggregateAsync(access.RestaurantId, tracking: false, cancellationToken);
        return restaurant is null
            ? ManagementResult<AdminGalleryResponse>.Failed(NotFound())
            : ManagementResult<AdminGalleryResponse>.Success(await ToAdminGalleryAsync(restaurant, cancellationToken));
    }

    public async Task<ManagementResult<AdminGalleryMutationResponse>> UploadImageAsync(
        OwnerRestaurantAccess access,
        string? etag,
        string? altText,
        string? caption,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        var errors = GalleryValidation.ValidateUpload(altText, caption, file is not null);
        if (errors.Count != 0)
        {
            return ManagementResult<AdminGalleryMutationResponse>.Failed(GalleryValidationFailure(errors));
        }

        // Cheap pre-check so an over-cap request never writes a blob; the authoritative check runs
        // again inside the transaction because the count can race.
        var currentCount = await dbContext.GalleryImages
            .CountAsync(item => item.RestaurantId == access.RestaurantId, cancellationToken);
        if (currentCount >= GalleryValidation.MaximumImages)
        {
            return ManagementResult<AdminGalleryMutationResponse>.Failed(GalleryLimitReached());
        }

        ValidatedImage image;
        try
        {
            image = await mediaStorage.ValidateAsync(file!, cancellationToken);
        }
        catch (MediaValidationException exception)
        {
            return ManagementResult<AdminGalleryMutationResponse>.Failed(GalleryValidationFailure(
                new Dictionary<string, string[]>(StringComparer.Ordinal) { ["file"] = [exception.Code] }));
        }

        var thumbnail = await thumbnailFactory.CreateAsync(image, cancellationToken);
        var mediaAssetId = Guid.NewGuid();
        var thumbnailSeed = Guid.NewGuid();
        var stored = await StoreGalleryBlobsAsync(
            access.RestaurantId, mediaAssetId, thumbnailSeed, image, thumbnail, cancellationToken);

        // Post-commit work (publication dispatch, the reload, the admin projection) can still throw after the
        // gallery row is durable. Compensation is therefore gated on "the transaction did not commit", not on
        // "an exception escaped": deleting the blobs of a committed row would publish 404 image URLs.
        var committed = false;
        ManagementResult<AdminGalleryMutationResponse> result;
        try
        {
            result = await MutateGalleryAsync(access, etag, "gallery.image.uploaded", (restaurant, now, audit) =>
            {
                if (restaurant.GalleryImages.Count >= GalleryValidation.MaximumImages)
                {
                    return Task.FromResult<ManagementFailure?>(GalleryLimitReached());
                }

                var asset = new MediaAssetEntity
                {
                    Id = mediaAssetId,
                    RestaurantId = restaurant.Id,
                    Restaurant = restaurant,
                    AltText = altText!.Trim(),
                    ProcessingStatus = "ready"
                };
                asset.Variants.Add(NewVariant(
                    asset, stored.Original, image.Bytes.LongLength,
                    GalleryStorageKey.Create(restaurant.Id, mediaAssetId, image.Extension)));
                if (stored.Thumbnail is not null)
                {
                    asset.Variants.Add(NewVariant(
                        asset, stored.Thumbnail, thumbnail.Bytes.LongLength,
                        GalleryStorageKey.Create(restaurant.Id, thumbnailSeed, image.Extension)));
                }
                dbContext.MediaAssets.Add(asset);

                var galleryImage = new GalleryImageEntity
                {
                    Id = Guid.NewGuid(),
                    RestaurantId = restaurant.Id,
                    Restaurant = restaurant,
                    MediaAssetId = asset.Id,
                    MediaAsset = asset,
                    Caption = GalleryValidation.NormalizeCaption(caption),
                    DisplayOrder = GalleryOrdering.NextDisplayOrder(
                        restaurant.GalleryImages.Select(item => item.DisplayOrder)),
                    IsActive = true,
                    CreatedAt = now,
                    UpdatedAt = now
                };
                restaurant.GalleryImages.Add(galleryImage);
                dbContext.GalleryImages.Add(galleryImage);
                audit.EntityId = galleryImage.Id;
                return Task.FromResult<ManagementFailure?>(null);
            }, cancellationToken, () => committed = true);
        }
        catch (Exception persistenceException)
        {
            dbContext.ChangeTracker.Clear();
            if (committed)
            {
                // The row and its variants are durable and already published; the blobs they point at must be
                // kept, or the published gallery would serve a permanently missing imageUrl/thumbnailUrl.
                logger.LogError(
                    persistenceException,
                    "Gallery upload for asset {MediaAssetId} in restaurant {RestaurantId} failed after its transaction committed; the stored blobs were kept.",
                    mediaAssetId,
                    access.RestaurantId);
                await stored.DisposeAsync();
                throw;
            }

            try
            {
                await stored.CompensateAsync();
            }
            catch (Exception cleanupException)
            {
                logger.LogCritical(
                    cleanupException,
                    "Gallery blob compensation failed for asset {MediaAssetId} in restaurant {RestaurantId}.",
                    mediaAssetId,
                    access.RestaurantId);
                await stored.DisposeAsync();
                throw new AggregateException(
                    "Gallery persistence and exact-blob compensation both failed.",
                    persistenceException,
                    cleanupException);
            }
            await stored.DisposeAsync();
            throw;
        }

        // A failure result is always pre-commit: every failure path inside the mutation rolls the transaction
        // back before returning, so no committed row can point at the blobs this compensation removes.
        if (result.Value is null)
        {
            try
            {
                await stored.CompensateAsync();
            }
            catch (Exception cleanupException)
            {
                logger.LogCritical(
                    cleanupException,
                    "Gallery blob compensation failed for asset {MediaAssetId} in restaurant {RestaurantId}.",
                    mediaAssetId,
                    access.RestaurantId);
            }
        }
        await stored.DisposeAsync();
        return result;
    }

    public Task<ManagementResult<AdminGalleryMutationResponse>> UpdateImageAsync(
        OwnerRestaurantAccess access,
        Guid imageId,
        string? etag,
        UpdateGalleryImageRequest request,
        CancellationToken cancellationToken) => MutateGalleryAsync(
            access, etag, "gallery.image.updated", (restaurant, now, audit) =>
    {
        var image = restaurant.GalleryImages.SingleOrDefault(item => item.Id == imageId);
        if (image is null)
        {
            return Task.FromResult<ManagementFailure?>(GalleryImageNotFound());
        }

        image.MediaAsset.AltText = request.AltText.Trim();
        image.MediaAsset.ConcurrencyVersion++;
        image.Caption = GalleryValidation.NormalizeCaption(request.Caption);
        // Visibility never renumbers the gallery: display order is maintained across all rows.
        image.IsActive = request.IsActive;
        image.UpdatedAt = now;
        image.ConcurrencyVersion++;
        audit.EntityId = image.Id;
        return Task.FromResult<ManagementFailure?>(null);
    }, cancellationToken);

    public async Task<ManagementResult<AdminGalleryMutationResponse>> DeleteImageAsync(
        OwnerRestaurantAccess access,
        Guid imageId,
        string? etag,
        CancellationToken cancellationToken)
    {
        var blobs = new List<GalleryBlobReference>();
        var result = await MutateGalleryAsync(access, etag, "gallery.image.deleted", async (restaurant, now, audit) =>
        {
            var image = restaurant.GalleryImages.SingleOrDefault(item => item.Id == imageId);
            if (image is null)
            {
                return GalleryImageNotFound();
            }

            blobs.Clear();
            blobs.AddRange(CollectBlobs(image));
            var stagingOffset = GalleryOrdering.StagingOffset(
                restaurant.GalleryImages.Select(item => item.DisplayOrder));
            restaurant.GalleryImages.Remove(image);
            dbContext.GalleryImages.Remove(image);
            dbContext.MediaAssets.Remove(image.MediaAsset);

            // A delete leaves a hole: the survivors keep their relative order and are renumbered to 1..N.
            var survivorsById = restaurant.GalleryImages.ToDictionary(item => item.Id);
            var survivors = GalleryOrdering
                .Renumber(restaurant.GalleryImages.Select(item => (item.Id, item.DisplayOrder)))
                .Select(item => survivorsById[item.Key])
                .ToArray();
            var restacked = await RestackGalleryAsync(survivors, stagingOffset, now, cancellationToken);
            if (restacked is not null)
            {
                return restacked;
            }

            audit.EntityId = image.Id;
            return null;
        }, cancellationToken);

        // Storage deletes happen only after a successful commit, so a rolled-back delete never loses a file.
        if (result.Value is not null)
        {
            await DeleteBlobsAsync(blobs, cancellationToken);
        }
        return result;
    }

    public Task<ManagementResult<AdminGalleryMutationResponse>> ReorderImagesAsync(
        OwnerRestaurantAccess access,
        string? etag,
        ReorderGalleryImagesRequest request,
        CancellationToken cancellationToken) => MutateGalleryAsync(
            access, etag, "gallery.images.reordered", async (restaurant, now, audit) =>
    {
        var byId = restaurant.GalleryImages.ToDictionary(item => item.Id);
        if (!GalleryValidation.IsCompletePermutation(request.ImageIds, byId.Keys))
        {
            return new ManagementFailure(
                400, "admin_validation", "Validation failed", Errors: GalleryValidation.ReorderIncompleteErrors());
        }

        var stagingOffset = GalleryOrdering.StagingOffset(
            restaurant.GalleryImages.Select(item => item.DisplayOrder));
        var ordered = request.ImageIds.Select(id => byId[id]).ToArray();
        var restacked = await RestackGalleryAsync(ordered, stagingOffset, now, cancellationToken);
        if (restacked is not null)
        {
            return restacked;
        }

        audit.EntityType = "gallery";
        audit.EntityId = null;
        return null;
    }, cancellationToken);

    /// <summary>
    /// Writes exactly <c>1..N</c> in the supplied order. Both passes come from <see cref="GalleryOrdering"/>:
    /// the requested order is staged above the current maximum and flushed first, because
    /// <c>(restaurant_id, display_order)</c> is unique, then the final contiguous order is written.
    /// </summary>
    private async Task<ManagementFailure?> RestackGalleryAsync(
        IReadOnlyList<GalleryImageEntity> ordered,
        int stagingOffset,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (ordered.Count == 0)
        {
            return null;
        }

        var byId = ordered.ToDictionary(item => item.Id);
        var orderedIds = ordered.Select(item => item.Id).ToArray();
        foreach (var (id, displayOrder) in GalleryOrdering.Stage(orderedIds, stagingOffset))
        {
            byId[id].DisplayOrder = displayOrder;
        }
        var staged = await StageAsync(cancellationToken);
        if (staged is not null)
        {
            return staged;
        }

        foreach (var (id, displayOrder) in GalleryOrdering.Assign(orderedIds))
        {
            var image = byId[id];
            image.DisplayOrder = displayOrder;
            image.UpdatedAt = now;
            image.ConcurrencyVersion++;
        }
        return null;
    }

    private async Task<ManagementResult<AdminGalleryMutationResponse>> MutateGalleryAsync(
        OwnerRestaurantAccess access,
        string? etag,
        string action,
        Func<RestaurantEntity, DateTimeOffset, MutationAudit, Task<ManagementFailure?>> apply,
        CancellationToken cancellationToken,
        Action? onCommitted = null)
    {
        var audit = new MutationAudit { EntityType = "gallery_image" };
        var outcome = await MutateCoreAsync(
            access, etag, action,
            (restaurant, _) => apply(restaurant, timeProvider.GetUtcNow(), audit),
            cancellationToken,
            audit,
            onCommitted);

        return outcome.Value is null
            ? ManagementResult<AdminGalleryMutationResponse>.Failed(outcome.Failure!)
            : ManagementResult<AdminGalleryMutationResponse>.Success(new AdminGalleryMutationResponse(
                await ToAdminGalleryAsync(outcome.Value.Restaurant, cancellationToken), outcome.Value.Publication));
    }

    private async Task<AdminGalleryResponse> ToAdminGalleryAsync(
        RestaurantEntity restaurant,
        CancellationToken cancellationToken)
    {
        var latest = await dbContext.PublicationOutbox.AsNoTracking()
            .Where(item => item.RestaurantId == restaurant.Id)
            .OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.OperationId)
            .FirstOrDefaultAsync(cancellationToken);
        return new AdminGalleryResponse(
            restaurant.GalleryImages
                .OrderBy(item => item.DisplayOrder).ThenBy(item => item.Id)
                .Select(ToAdminGalleryImage).ToArray(),
            GalleryValidation.MaximumImages,
            restaurant.DraftVersion.ToString(CultureInfo.InvariantCulture),
            DraftETag.Create(restaurant.Id, restaurant.DraftVersion),
            latest is null ? null : ToPublicationStatus(latest));
    }

    private static AdminGalleryImageResponse ToAdminGalleryImage(GalleryImageEntity image)
    {
        var variants = image.MediaAsset.Variants
            .OrderBy(item => item.Width).ThenBy(item => item.Height).ThenBy(item => item.Id).ToArray();
        var thumbnail = variants.Length == 0 ? null : variants[0];
        var original = variants.Length == 0 ? null : variants[^1];
        return new AdminGalleryImageResponse(
            image.Id.ToString(),
            image.MediaAssetId.ToString(),
            image.MediaAsset.AltText,
            image.Caption,
            image.DisplayOrder,
            image.IsActive,
            original?.Url ?? string.Empty,
            thumbnail?.Url ?? string.Empty,
            original?.Width ?? 0,
            original?.Height ?? 0,
            original?.FileSizeBytes,
            image.CreatedAt,
            image.UpdatedAt);
    }

    private static MediaVariantEntity NewVariant(
        MediaAssetEntity asset,
        StoredMedia stored,
        long fileSizeBytes,
        string storageKey) => new()
        {
            Id = Guid.NewGuid(),
            RestaurantId = asset.RestaurantId,
            MediaAssetId = asset.Id,
            MediaAsset = asset,
            Url = stored.Url,
            Width = stored.Width,
            Height = stored.Height,
            StorageKey = storageKey,
            FileSizeBytes = fileSizeBytes
        };

    private static IEnumerable<GalleryBlobReference> CollectBlobs(GalleryImageEntity image) => image.MediaAsset
        .Variants
        .Select(variant => GalleryStorageKey.TryParse(variant.StorageKey, out var reference) ? reference : null)
        .OfType<GalleryBlobReference>()
        .DistinctBy(reference => (reference.FileNameSeed, reference.Extension));

    private async Task<StoredGalleryBlobs> StoreGalleryBlobsAsync(
        Guid restaurantId,
        Guid mediaAssetId,
        Guid thumbnailSeed,
        ValidatedImage image,
        GalleryThumbnail thumbnail,
        CancellationToken cancellationToken)
    {
        var original = await mediaStorage.StoreAsync(restaurantId, mediaAssetId, image, cancellationToken);
        if (thumbnail.ReusedSource)
        {
            // A source already inside the thumbnail box needs no second blob: the single variant serves
            // as both the full-size image and the thumbnail, which the public projection allows.
            return new StoredGalleryBlobs(original, null);
        }

        try
        {
            var stored = await mediaStorage.StoreAsync(
                restaurantId,
                thumbnailSeed,
                new ValidatedImage(thumbnail.Bytes, image.Extension, image.ContentType, thumbnail.Width, thumbnail.Height),
                cancellationToken);
            return new StoredGalleryBlobs(original, stored);
        }
        catch
        {
            try
            {
                await original.CompensateAsync(CancellationToken.None);
            }
            catch (Exception cleanupException)
            {
                logger.LogCritical(
                    cleanupException,
                    "Gallery original blob compensation failed for asset {MediaAssetId} in restaurant {RestaurantId}.",
                    mediaAssetId,
                    restaurantId);
            }
            await original.DisposeAsync();
            throw;
        }
    }

    /// <summary>
    /// Best-effort blob removal after a committed delete. The database is the record of truth, so a
    /// storage failure is logged and does not fail the request.
    /// </summary>
    private async Task DeleteBlobsAsync(
        IReadOnlyList<GalleryBlobReference> blobs,
        CancellationToken cancellationToken)
    {
        foreach (var blob in blobs)
        {
            try
            {
                await mediaStorage.DeleteAsync(
                    blob.RestaurantId, blob.FileNameSeed, blob.Extension, cancellationToken);
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    exception,
                    "Gallery blob {StorageKey} could not be removed after a committed delete.",
                    GalleryStorageKey.Create(blob.RestaurantId, blob.FileNameSeed, blob.Extension));
            }
        }
    }

    private static ManagementFailure GalleryValidationFailure(IReadOnlyDictionary<string, string[]> errors) =>
        new(400, "admin_validation", "Gallery request is invalid", Errors: errors);

    private static ManagementFailure GalleryLimitReached() => new(
        409, GalleryValidation.LimitReached, "The gallery already holds the maximum number of images");

    private static ManagementFailure GalleryImageNotFound() => new(
        404, GalleryValidation.ImageNotFound, "Gallery image not found");

    private sealed class StoredGalleryBlobs(StoredMedia original, StoredMedia? thumbnail) : IAsyncDisposable
    {
        public StoredMedia Original { get; } = original;
        public StoredMedia? Thumbnail { get; } = thumbnail;

        /// <summary>
        /// Removes both blobs. Each removal is attempted independently so a failure on one never leaks the
        /// other; the collected failures surface together once both attempts have run.
        /// </summary>
        public async Task CompensateAsync()
        {
            List<Exception>? failures = null;
            StoredMedia[] blobs = Thumbnail is null ? [Original] : [Original, Thumbnail];
            foreach (var media in blobs)
            {
                try
                {
                    await media.CompensateAsync(CancellationToken.None);
                }
                catch (Exception exception)
                {
                    (failures ??= []).Add(exception);
                }
            }

            if (failures is not null)
            {
                throw new AggregateException("One or more gallery blob compensations failed.", failures);
            }
        }

        public async ValueTask DisposeAsync()
        {
            await Original.DisposeAsync();
            if (Thumbnail is not null)
            {
                await Thumbnail.DisposeAsync();
            }
        }
    }
}
