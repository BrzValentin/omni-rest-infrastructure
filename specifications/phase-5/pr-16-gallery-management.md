# PR-16 — Gallery Management (owner)

**Source:** `requirments/Phase 5/Phase_5_PR-16_Public_Gallery_Management.md`

**Normalization rulings:** `specifications/phase-5/README.md` section 2

## 1. Data model

New table `restaurant_gallery_images`, configured in a new `ConfigurePhase5` partial on `MenuDbContext`
(`src/backend/OmniRest.Api/Data/Phase5Model.cs`, mirroring `Phase3Model.cs`).

`GalleryImageEntity`:

| Property | Column | Type | Notes |
| --- | --- | --- | --- |
| `Id` | `id` | `uuid` | PK |
| `RestaurantId` | `restaurant_id` | `uuid` | FK to `restaurants`, cascade delete |
| `MediaAssetId` | `media_asset_id` | `uuid` | FK to `media_assets` on `(media_asset_id, restaurant_id)` -> `(id, restaurant_id)`, `DeleteBehavior.Cascade` |
| `Caption` | `caption` | `varchar(300)` | nullable |
| `DisplayOrder` | `display_order` | `int` | 1-based, contiguous |
| `IsActive` | `is_active` | `bool` | default `true` |
| `CreatedAt` | `created_at` | `timestamptz` | |
| `UpdatedAt` | `updated_at` | `timestamptz` | |
| `ConcurrencyVersion` | `concurrency_version` | `bigint` | default `1`, `IsConcurrencyToken()` |

Indexes and constraints:

- unique index on `(restaurant_id, display_order)` — enforces PR-16 Task 1 "Display Order must be unique within a
  restaurant" and forces the staged reorder;
- unique index on `(restaurant_id, media_asset_id)` — one gallery row per asset;
- index on `(restaurant_id, is_active, display_order)` — the public read path;
- check constraint `ck_restaurant_gallery_images_display_order`: `display_order > 0`;
- check constraint `ck_restaurant_gallery_images_caption`: `caption IS NULL OR length(btrim(caption)) > 0`.

`media_variants` gains two nullable columns in the same migration (README ruling 2):

| Property | Column | Type | Notes |
| --- | --- | --- | --- |
| `StorageKey` | `storage_key` | `varchar(512)` | nullable; `{restaurantId:N}/{fileNameSeed}{ext}` |
| `FileSizeBytes` | `file_size_bytes` | `bigint` | nullable; byte length written |

Existing rows keep `NULL` — no backfill. New gallery uploads always populate both.

Migration name: `20260827120000_Phase5RestaurantGallery`. Add the matching `DbSet<GalleryImageEntity> GalleryImages`
to `MenuDbContext` and update `MenuDbContextModelSnapshot`. `MigrationTests` must continue to pass.

## 2. Storage layout

A gallery upload writes **two** blobs through the existing `ILocalMediaStorage`:

1. the original, stored with the media asset id as the filename seed;
2. a thumbnail, stored with a separate `Guid` as the filename seed, so the two never collide on
   `ResolveFileName(seed, extension)`.

The thumbnail is produced with `SixLabors.ImageSharp` (already referenced): resize so the longest edge is at most
**480 px**, `ResizeMode.Max` (aspect preserved, never upscaled), re-encoded in the original format. If the source is
already within 480 px on both edges the original bytes are reused as the thumbnail blob rather than re-encoded.

Both blobs become `media_variants` rows on one `media_assets` row, each with `storage_key` and `file_size_bytes`
populated. `thumbnailUrl` is the smallest variant by width; `imageUrl` is the largest.

Failure handling mirrors `MediaAssetService.UploadAsync`: on any persistence failure, compensate **both** stored
blobs, log `LogCritical` if compensation itself fails, and rethrow. No orphaned rows, no orphaned files
(PR-16 Task 3).

## 3. API surface

All routes require the owner policy. All mutations require antiforgery and `If-Match` carrying the current draft
`ETag`, and return `AdminGalleryMutationResponse` with the refreshed gallery, the new `ETag` response header, and
the `X-Publication-Operation-Id` header — identical to the Phase 4 menu mutation envelope.

| Method | Route | Body | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/gallery` | — | Full gallery, all rows, ordered |
| `POST` | `/api/v1/admin/gallery` | `multipart/form-data` | Upload and append |
| `PATCH` | `/api/v1/admin/gallery/reorder` | `ReorderGalleryImagesRequest` | Replace the whole order |
| `PATCH` | `/api/v1/admin/gallery/{id:guid}` | `UpdateGalleryImageRequest` | Caption, alt text, active state |
| `DELETE` | `/api/v1/admin/gallery/{id:guid}` | — | Delete and renumber |

`/reorder` is mapped **before** `/{id:guid}` so the literal segment wins, matching `AdminMenuEndpoints`.

### Contracts (`src/backend/OmniRest.Api/Menus/GalleryManagementContracts.cs`)

```csharp
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
```

`Width`/`Height` are the **original** variant's dimensions.

### Upload form fields

| Field | Required | Rule |
| --- | --- | --- |
| `file` | yes | JPG/JPEG/PNG/WEBP, validated by `ILocalMediaStorage.ValidateAsync` (magic-byte format check, declared content type must match, size and pixel caps) |
| `altText` | yes | `RestaurantValidation.ValidateAltText` — trimmed, 1..300 chars |
| `caption` | no | trimmed; null when blank; max 300 chars |

`POST` returns `201 Created` with `Location: /api/v1/admin/gallery/{id}` and the mutation envelope, matching the
`media-assets` upload precedent.

## 4. Validation (`GalleryValidation.cs` + service checks)

| Code | Field | Status | Condition |
| --- | --- | --- | --- |
| `field_required` | `file` | 400 | no file part |
| `media_form_required` | `file` | 400 | request is not multipart |
| `media_size_invalid` | `file` | 400 | zero bytes or over `MediaStorage:MaximumBytes` |
| `media_content_invalid` | `file` | 400 | unsupported or mismatched format, dimension/pixel cap exceeded |
| `field_required` | `altText` | 400 | missing or whitespace |
| `value_too_long` | `altText` | 400 | over 300 chars |
| `value_too_long` | `caption` | 400 | over 300 chars |
| `gallery_reorder_incomplete` | `imageIds` | 400 | count mismatch, duplicate id, or unknown id |
| `field_required` | `imageIds` | 400 | null or empty list |
| `gallery_limit_reached` | — | 409 | restaurant already holds 50 images |
| `gallery_image_not_found` | — | 404 | unknown id, or an id owned by another restaurant |
| `concurrency_conflict` | — | 409 | `If-Match` missing or stale |

Reorder validation is total: the submitted list must be a permutation of exactly the restaurant's current image ids
(PR-16 Task 6 "Validate duplicates and completeness").

## 5. Business rules (PR-16 Task 8)

- A new image receives `max(display_order) + 1`, or `1` when the gallery is empty.
- Deleting an image renumbers the survivors to a contiguous `1..N` in their existing relative order.
- Reorder writes exactly `1..N` in the submitted order.
- Order is maintained over all rows regardless of `is_active`, so hiding a photo never renumbers the gallery
  (README ruling 6).
- Renumber and reorder both stage above `max(display_order)` first, flush with `StageAsync`, then write the final
  order, because `(restaurant_id, display_order)` is unique.

## 6. Service

`IGalleryManagementService` in `src/backend/OmniRest.Api/Restaurants/GalleryManagementService.cs`, implemented as a
further `partial` on `RestaurantManagementService` so it reuses `MutateCoreAsync`, `LoadAggregateAsync`,
`StageAsync`, `DraftETag`, the outbox, the audit writer, and the publication dispatcher.

```csharp
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
```

Ordering of side effects:

1. **Upload** — validate the form, check the 50-image cap against the current count, validate and store both blobs,
   then enter `MutateCoreAsync` to persist the asset, variants, and gallery row. Compensate the blobs if the
   transaction fails or the cap check races.
2. **Delete** — capture the variants' storage identity, run `MutateCoreAsync` to remove the gallery row, the media
   asset, and its variants and to renumber survivors, and only after a successful commit call
   `ILocalMediaStorage.DeleteAsync` for each blob. A storage delete failure is logged as a warning and does not fail
   the request; the database is the record of truth.
3. **Update / reorder** — pure aggregate mutations, no storage interaction.

`LoadAggregateAsync` must be extended to `Include(x => x.GalleryImages).ThenInclude(x => x.MediaAsset).ThenInclude(x => x.Variants)`
so the mutation envelope can project the gallery without a second round trip.

## 7. Authorization (PR-16 Task 9)

- **Anonymous** requests to `/api/v1/admin/gallery*` -> `401`. The group carries `RequireAuthorization(OwnerPolicy)`,
  and cookie authentication challenges rather than forbids when no identity is present. This matches the rest of the
  admin surface; an earlier draft of this section said `403`, which was wrong.
- An **authenticated** principal with no owner membership -> `403` (`TypedResults.Forbid`), from the owner-context
  resolution inside each handler.
- Missing or invalid antiforgery token on a mutation -> `400 csrf_invalid`.
- An image id belonging to another restaurant -> `404 gallery_image_not_found`.
- The public routes are `AllowAnonymous` and read-only.

## 8. Tests (PR-16 Task 10)

Unit — `src/backend/OmniRest.Api.Tests/Unit/GalleryValidationTests.cs`:
alt text and caption rules; reorder completeness/duplicate/unknown-id rejection; the 1..N renumber helper across
insert, delete, and reorder, including a delete from the middle and a reorder that reverses the gallery.

Unit — `src/backend/OmniRest.Api.Tests/Unit/GalleryThumbnailTests.cs`:
thumbnail sizing (landscape, portrait, square, and an already-small source that must not be upscaled), using
in-memory ImageSharp images and a fake `ILocalMediaStorage`.

Integration — `src/backend/OmniRest.Api.Tests/Integration/AdminGalleryApiTests.cs`, built on `OwnerApiHarness`:
upload appends last and returns `201`; unsupported format and oversized file rejected; missing alt text rejected;
`GET` returns everything in order; `PATCH` updates caption/alt/active and the public projection drops an inactive
image; `DELETE` removes the row and renumbers to `1..N`; reorder persists and rejects incomplete lists; stale and
missing `If-Match` return `409`; missing antiforgery returns `400`; anonymous returns `401`; another tenant's image
id returns `404`; the 51st upload returns `409 gallery_limit_reached`; every mutation writes an audit event and a
publication outbox row.
