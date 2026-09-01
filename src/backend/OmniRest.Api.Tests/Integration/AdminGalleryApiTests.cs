using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using static OmniRest.Api.Tests.Integration.OwnerApiHarness;

namespace OmniRest.Api.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class AdminGalleryApiTests(PostgresFixture postgres)
{
    private const string Email = "gallery@example.test";
    private const string GalleryUri = "/api/v1/admin/gallery";

    private static readonly byte[] Png = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");

    /// <summary>
    /// Longest edge well above <see cref="GalleryThumbnailFactory.MaximumEdge"/>, so an upload of it takes the
    /// genuine two-blob path: a resized thumbnail plus the untouched original. Generated rather than embedded
    /// so the fixture stays a few kilobytes of source.
    /// </summary>
    private static readonly byte[] LargePng = CreatePng(LargeWidth, LargeHeight);

    private const int LargeWidth = 1200;
    private const int LargeHeight = 800;
    private const int ExpectedThumbnailWidth = 480;
    private const int ExpectedThumbnailHeight = 320;

    [Fact]
    public async Task GalleryReadUpdateDeleteAndReorderKeepOrderContiguousAndPublishAutomatically()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);

        // The admin read returns every row, active or not, in display order.
        using var readResponse = await client.GetAsync(GalleryUri);
        Assert.Equal(HttpStatusCode.OK, readResponse.StatusCode);
        Assert.NotNull(readResponse.Headers.ETag);
        var gallery = await ExpectOkAsync<AdminGalleryResponse>(readResponse);
        Assert.Equal(50, gallery.MaximumImages);
        Assert.Equal(4, gallery.Images.Count);
        Assert.Equal([1, 2, 3, 4], gallery.Images.Select(item => item.DisplayOrder));
        Assert.Equal([true, true, true, false], gallery.Images.Select(item => item.IsActive));
        Assert.All(gallery.Images, item => Assert.NotEmpty(item.ImageUrl));
        Assert.All(gallery.Images, item => Assert.NotEmpty(item.ThumbnailUrl));
        Assert.All(gallery.Images, item => Assert.Equal((640, 480), (item.Width, item.Height)));

        // The public projection carries only the active rows, in display order.
        var beforeUpdate = await ReadPublicGalleryAsync(client);
        Assert.Equal(3, beforeUpdate.Images.Count);
        Assert.Equal(
            gallery.Images.Take(3).Select(item => item.Id),
            beforeUpdate.Images.Select(item => item.Id));

        // Update rewrites caption, alt text, and visibility without renumbering anything.
        var second = gallery.Images[1];
        var updated = await ExpectOkAsync<AdminGalleryMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"{GalleryUri}/{second.Id}",
            new UpdateGalleryImageRequest("Plating a main, updated", "  New caption  ", false),
            await GetAntiforgeryAsync(client), gallery.ETag));
        var updatedSecond = updated.Gallery.Images.Single(item => item.Id == second.Id);
        Assert.Equal("Plating a main, updated", updatedSecond.AltText);
        Assert.Equal("New caption", updatedSecond.Caption);
        Assert.False(updatedSecond.IsActive);
        Assert.Equal([1, 2, 3, 4], updated.Gallery.Images.Select(item => item.DisplayOrder));
        Assert.NotEqual(gallery.ETag, updated.Gallery.ETag);
        Assert.Equal(PublicationStatuses.Succeeded, updated.Publication.Status);

        var afterUpdate = await ReadPublicGalleryAsync(client);
        Assert.DoesNotContain(afterUpdate.Images, item => item.Id == second.Id);
        Assert.Equal(2, afterUpdate.Images.Count);

        // Delete removes the row and renumbers the survivors to a contiguous 1..N.
        var first = updated.Gallery.Images[0];
        var deleted = await ExpectOkAsync<AdminGalleryMutationResponse>(await SendAsync<object>(
            client, HttpMethod.Delete, $"{GalleryUri}/{first.Id}", null,
            await GetAntiforgeryAsync(client), updated.Gallery.ETag));
        Assert.DoesNotContain(deleted.Gallery.Images, item => item.Id == first.Id);
        Assert.Equal(3, deleted.Gallery.Images.Count);
        Assert.Equal([1, 2, 3], deleted.Gallery.Images.Select(item => item.DisplayOrder));

        // Reorder writes exactly 1..N in the submitted order.
        var reversed = deleted.Gallery.Images.Select(item => Guid.Parse(item.Id)).Reverse().ToArray();
        var reordered = await ExpectOkAsync<AdminGalleryMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"{GalleryUri}/reorder",
            new ReorderGalleryImagesRequest(reversed),
            await GetAntiforgeryAsync(client), deleted.Gallery.ETag));
        Assert.Equal(reversed, reordered.Gallery.Images.Select(item => Guid.Parse(item.Id)));
        Assert.Equal([1, 2, 3], reordered.Gallery.Images.Select(item => item.DisplayOrder));

        // A partial reorder changes nothing.
        using var partial = await SendAsync(
            client, HttpMethod.Patch, $"{GalleryUri}/reorder",
            new ReorderGalleryImagesRequest(reversed.Take(2).ToArray()),
            await GetAntiforgeryAsync(client), reordered.Gallery.ETag);
        Assert.Equal(HttpStatusCode.BadRequest, partial.StatusCode);
        Assert.Contains("gallery_reorder_incomplete", await partial.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var reloaded = await client.GetFromJsonAsync<AdminGalleryResponse>(GalleryUri);
        Assert.Equal(reversed, reloaded!.Images.Select(item => Guid.Parse(item.Id)));
        Assert.Equal(reordered.Gallery.ETag, reloaded.ETag);

        // Every mutation wrote an audit event and a publication outbox row.
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var actions = await db.AuditEvents.AsNoTracking()
            .Where(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId)
            .Select(item => item.Action).ToListAsync();
        Assert.Contains("gallery.image.updated", actions);
        Assert.Contains("gallery.image.deleted", actions);
        Assert.Contains("gallery.images.reordered", actions);
        Assert.Equal(3, await db.PublicationOutbox.AsNoTracking()
            .CountAsync(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId));

        // The deleted gallery row took its media asset and variants with it.
        Assert.Equal(3, await db.GalleryImages.AsNoTracking()
            .CountAsync(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId));
        Assert.False(await db.MediaAssets.AsNoTracking()
            .AnyAsync(item => item.Id == Guid.Parse(first.MediaAssetId)));
    }

    [Fact]
    public async Task GalleryEndpointsEnforceAuthenticationCsrfConcurrencyAndTenantIsolation()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.AlternateRestaurantId, "alternate-gallery@example.test");
        using var client = CreateSecureClient(factory);

        using var anonymousRead = await client.GetAsync(GalleryUri);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousRead.StatusCode);
        using var anonymousWrite = await SendAsync<object>(
            client, HttpMethod.Delete, $"{GalleryUri}/{Guid.NewGuid()}", null, null, null);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousWrite.StatusCode);

        await LoginAsync(client, Email);
        var gallery = await client.GetFromJsonAsync<AdminGalleryResponse>(GalleryUri);
        Assert.NotNull(gallery);
        var target = gallery.Images[0];

        using var badCsrf = await SendAsync(
            client, HttpMethod.Patch, $"{GalleryUri}/{target.Id}",
            new UpdateGalleryImageRequest("Bad token", null, true), "invalid-token", gallery.ETag);
        Assert.Equal(HttpStatusCode.BadRequest, badCsrf.StatusCode);
        Assert.Contains("csrf_invalid", await badCsrf.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var missingIfMatch = await SendAsync(
            client, HttpMethod.Patch, $"{GalleryUri}/{target.Id}",
            new UpdateGalleryImageRequest("No If-Match", null, true), await GetAntiforgeryAsync(client), null);
        Assert.Equal(HttpStatusCode.Conflict, missingIfMatch.StatusCode);
        Assert.Contains("concurrency_conflict", await missingIfMatch.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var staleIfMatch = await SendAsync(
            client, HttpMethod.Patch, $"{GalleryUri}/{target.Id}",
            new UpdateGalleryImageRequest("Stale", null, true), await GetAntiforgeryAsync(client),
            "\"draft-00000000000000000000000000000000-1\"");
        Assert.Equal(HttpStatusCode.Conflict, staleIfMatch.StatusCode);
        Assert.Contains("concurrency_conflict", await staleIfMatch.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // An id owned by another restaurant is indistinguishable from a missing one.
        var foreignImageId = await SeedGalleryImageAsync(factory, GuardedSampleDataSeeder.AlternateRestaurantId);
        using var crossTenantUpdate = await SendAsync(
            client, HttpMethod.Patch, $"{GalleryUri}/{foreignImageId}",
            new UpdateGalleryImageRequest("Stolen", null, true), await GetAntiforgeryAsync(client), gallery.ETag);
        Assert.Equal(HttpStatusCode.NotFound, crossTenantUpdate.StatusCode);
        Assert.Contains("gallery_image_not_found", await crossTenantUpdate.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var crossTenantDelete = await SendAsync<object>(
            client, HttpMethod.Delete, $"{GalleryUri}/{foreignImageId}", null,
            await GetAntiforgeryAsync(client), gallery.ETag);
        Assert.Equal(HttpStatusCode.NotFound, crossTenantDelete.StatusCode);

        using var unknown = await SendAsync<object>(
            client, HttpMethod.Delete, $"{GalleryUri}/{Guid.NewGuid()}", null,
            await GetAntiforgeryAsync(client), gallery.ETag);
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    [Fact]
    public async Task UploadRejectsBadFormsBadAltTextAndTheFiftyImageCapBeforeTouchingStorage()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);

        // A JSON body is not a gallery upload.
        using var notMultipart = await SendRawAsync(
            client, HttpMethod.Post, GalleryUri, "{}", await GetAntiforgeryAsync(client), null);
        Assert.Equal(HttpStatusCode.BadRequest, notMultipart.StatusCode);
        Assert.Contains("media_form_required", await notMultipart.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var missingAltText = await UploadAsync(client, Png, "image/png", null, null, await GetAntiforgeryAsync(client));
        Assert.Equal(HttpStatusCode.BadRequest, missingAltText.StatusCode);
        Assert.Contains("field_required", await missingAltText.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var longAltText = await UploadAsync(
            client, Png, "image/png", new string('a', 301), null, await GetAntiforgeryAsync(client));
        Assert.Equal(HttpStatusCode.BadRequest, longAltText.StatusCode);
        Assert.Contains("value_too_long", await longAltText.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var noFile = await UploadAsync(client, null, null, "Dining room", null, await GetAntiforgeryAsync(client));
        Assert.Equal(HttpStatusCode.BadRequest, noFile.StatusCode);
        Assert.Contains("field_required", await noFile.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var noAntiforgery = await UploadAsync(client, Png, "image/png", "Dining room", null, "invalid-token");
        Assert.Equal(HttpStatusCode.BadRequest, noAntiforgery.StatusCode);
        Assert.Contains("csrf_invalid", await noAntiforgery.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // The 51st image is refused before any blob is written.
        await FillGalleryAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, GalleryValidation.MaximumImages);
        using var overCap = await UploadAsync(client, Png, "image/png", "One too many", null, await GetAntiforgeryAsync(client));
        Assert.Equal(HttpStatusCode.Conflict, overCap.StatusCode);
        Assert.Contains("gallery_limit_reached", await overCap.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    /// <summary>
    /// Exercises a real gallery upload through <see cref="LocalMediaStorage"/>, exactly as the Phase 3
    /// media-asset upload test does. That storage is Linux/macOS only, so this test cannot pass on a
    /// native Windows host (<c>specifications/phase-5/README.md</c> section 6).
    /// The source is larger than the thumbnail box, so this covers the genuine two-blob path: a resized
    /// thumbnail and the untouched original, stored under separate keys and projected as separate URLs.
    /// </summary>
    [Fact]
    public async Task UploadAppendsLastStoresTwoVariantsAndRejectsUnsupportedContent()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);
        var gallery = await client.GetFromJsonAsync<AdminGalleryResponse>(GalleryUri);
        Assert.NotNull(gallery);

        using var mismatched = await UploadAsync(
            client, LargePng, "text/plain", "Mismatched declaration", null, await GetAntiforgeryAsync(client));
        Assert.Equal(HttpStatusCode.BadRequest, mismatched.StatusCode);
        Assert.Contains("media_content_invalid", await mismatched.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // 5.5 MB is over the 5 MB MediaStorage:MaximumBytes cap but still comfortably inside the endpoint's
        // 6 MB RequestSizeLimit, so this asserts media-size validation and not the request-size limit.
        using var oversized = await UploadAsync(
            client, new byte[11 * 512 * 1024], "image/png", "Oversized", null, await GetAntiforgeryAsync(client));
        Assert.Equal(HttpStatusCode.BadRequest, oversized.StatusCode);
        Assert.Contains("media_size_invalid", await oversized.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var uploaded = await UploadAsync(
            client, LargePng, "image/png", "A newly uploaded photo", "Fresh from the kitchen",
            await GetAntiforgeryAsync(client), gallery.ETag);
        Assert.Equal(HttpStatusCode.Created, uploaded.StatusCode);
        Assert.NotNull(uploaded.Headers.ETag);
        Assert.True(uploaded.Headers.Contains("X-Publication-Operation-Id"));
        var created = await uploaded.Content.ReadFromJsonAsync<AdminGalleryMutationResponse>();
        Assert.NotNull(created);
        Assert.Equal(5, created.Gallery.Images.Count);
        var appended = created.Gallery.Images[^1];
        Assert.Equal(5, appended.DisplayOrder);
        Assert.Equal("A newly uploaded photo", appended.AltText);
        Assert.Equal("Fresh from the kitchen", appended.Caption);
        Assert.True(appended.IsActive);
        Assert.Equal($"{GalleryUri}/{appended.Id}", uploaded.Headers.Location?.ToString());
        Assert.Equal(LargePng.LongLength, appended.FileSizeBytes);
        Assert.Equal((LargeWidth, LargeHeight), (appended.Width, appended.Height));

        // Two distinct blobs: the admin projection reports the largest variant as the image and the smallest
        // as the thumbnail, so the two URLs must differ.
        Assert.NotEqual(appended.ImageUrl, appended.ThumbnailUrl);

        using var originalBytes = await FetchMediaAsync(client, appended.ImageUrl);
        Assert.Equal(HttpStatusCode.OK, originalBytes.StatusCode);
        Assert.Equal(LargePng, await originalBytes.Content.ReadAsByteArrayAsync());

        using var thumbnailBytes = await FetchMediaAsync(client, appended.ThumbnailUrl);
        Assert.Equal(HttpStatusCode.OK, thumbnailBytes.StatusCode);
        var thumbnail = Image.Identify(await thumbnailBytes.Content.ReadAsByteArrayAsync());
        Assert.Equal(ExpectedThumbnailWidth, thumbnail.Width);
        Assert.Equal(ExpectedThumbnailHeight, thumbnail.Height);
        Assert.Equal(GalleryThumbnailFactory.MaximumEdge, Math.Max(thumbnail.Width, thumbnail.Height));
        // The aspect ratio survives the resize.
        Assert.Equal(
            (double)LargeWidth / LargeHeight,
            (double)thumbnail.Width / thumbnail.Height,
            precision: 3);

        // The public projection picks the smallest variant as the thumbnail and the largest as the image.
        var published = await ReadPublicGalleryAsync(client);
        var publishedImage = published.Images.Single(item => item.Id == appended.Id);
        Assert.Equal(appended.ImageUrl, publishedImage.ImageUrl);
        Assert.Equal(appended.ThumbnailUrl, publishedImage.ThumbnailUrl);
        Assert.Equal((LargeWidth, LargeHeight), (publishedImage.Width, publishedImage.Height));
        Assert.Equal(
            (ExpectedThumbnailWidth, ExpectedThumbnailHeight),
            (publishedImage.ThumbnailWidth, publishedImage.ThumbnailHeight));

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var variants = await db.MediaVariants.AsNoTracking()
            .Where(item => item.MediaAssetId == Guid.Parse(appended.MediaAssetId))
            .OrderBy(item => item.Width).ToListAsync();
        Assert.Equal(2, variants.Count);
        Assert.All(variants, variant => Assert.NotNull(variant.StorageKey));
        Assert.All(variants, variant => Assert.NotNull(variant.FileSizeBytes));
        Assert.NotEqual(variants[0].StorageKey, variants[1].StorageKey);
        Assert.Equal([ExpectedThumbnailWidth, LargeWidth], variants.Select(item => item.Width));
        Assert.Equal(appended.ThumbnailUrl, variants[0].Url);
        Assert.Equal(appended.ImageUrl, variants[1].Url);
        Assert.True(variants[0].FileSizeBytes < variants[1].FileSizeBytes);
    }

    /// <summary>
    /// The complement of the two-variant case: a source already inside the thumbnail box is reused
    /// byte-for-byte, so exactly one blob and one variant back both URLs. Linux/macOS only, as above.
    /// </summary>
    [Fact]
    public async Task UploadOfASourceInsideTheThumbnailBoxStoresOneVariantServingBothUrls()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);
        var gallery = await client.GetFromJsonAsync<AdminGalleryResponse>(GalleryUri);
        Assert.NotNull(gallery);

        using var uploaded = await UploadAsync(
            client, Png, "image/png", "A one pixel photo", null,
            await GetAntiforgeryAsync(client), gallery.ETag);
        Assert.Equal(HttpStatusCode.Created, uploaded.StatusCode);
        var created = await uploaded.Content.ReadFromJsonAsync<AdminGalleryMutationResponse>();
        Assert.NotNull(created);
        var appended = created.Gallery.Images[^1];
        Assert.Equal((1, 1), (appended.Width, appended.Height));

        // The 1x1 source needs no resize, so a single blob serves as both the image and the thumbnail.
        Assert.Equal(appended.ImageUrl, appended.ThumbnailUrl);
        using var storedBytes = await FetchMediaAsync(client, appended.ImageUrl);
        Assert.Equal(HttpStatusCode.OK, storedBytes.StatusCode);
        Assert.Equal(Png, await storedBytes.Content.ReadAsByteArrayAsync());

        var published = await ReadPublicGalleryAsync(client);
        var publishedImage = published.Images.Single(item => item.Id == appended.Id);
        Assert.Equal(publishedImage.ImageUrl, publishedImage.ThumbnailUrl);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var variants = await db.MediaVariants.AsNoTracking()
            .Where(item => item.MediaAssetId == Guid.Parse(appended.MediaAssetId)).ToListAsync();
        Assert.Single(variants);
        Assert.NotNull(variants[0].StorageKey);
        Assert.Equal(Png.LongLength, variants[0].FileSizeBytes);
    }

    /// <summary>
    /// Builds a real PNG of the requested size so the upload tests can drive the resize path without
    /// carrying a large base64 blob in source. The gradient compresses to a few kilobytes, well inside the
    /// 5 MB <c>MediaStorage:MaximumBytes</c> cap.
    /// </summary>
    private static byte[] CreatePng(int width, int height)
    {
        using var image = new Image<Rgba32>(width, height);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < accessor.Height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (var x = 0; x < row.Length; x++)
                {
                    row[x] = new Rgba32((byte)(x % 256), (byte)(y % 256), 128, 255);
                }
            }
        });

        using var buffer = new MemoryStream();
        image.Save(buffer, new PngEncoder());
        return buffer.ToArray();
    }

    /// <summary>
    /// Fetches a media blob for the seeded tenant. Media is served only to the restaurant that owns it
    /// (PR-20 Task 8), and the owner client is bound to <c>localhost</c> so its auth cookie works, which
    /// resolves to no restaurant under the Testing environment. In deployment the owner portal is served
    /// from the restaurant's own host, so this substitution is a test-harness detail, not a product one.
    /// </summary>
    private static async Task<HttpResponseMessage> FetchMediaAsync(HttpClient client, string url)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Host = "menu.localhost";
        return await client.SendAsync(request);
    }

    private static async Task<PublicGalleryResponse> ReadPublicGalleryAsync(HttpClient client)
    {
        var previousHost = client.DefaultRequestHeaders.Host;
        client.DefaultRequestHeaders.Host = "menu.localhost";
        try
        {
            return (await client.GetFromJsonAsync<PublicGalleryResponse>("/api/v1/public/restaurant/gallery"))!;
        }
        finally
        {
            client.DefaultRequestHeaders.Host = previousHost;
        }
    }

    private static async Task<HttpResponseMessage> UploadAsync(
        HttpClient client,
        byte[]? bytes,
        string? contentType,
        string? altText,
        string? caption,
        string token,
        string? etag = null)
    {
        var content = new MultipartFormDataContent();
        if (bytes is not null)
        {
            var file = new ByteArrayContent(bytes);
            file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType!);
            content.Add(file, "file", "gallery.png");
        }
        if (altText is not null) content.Add(new StringContent(altText), "altText");
        if (caption is not null) content.Add(new StringContent(caption), "caption");
        var request = new HttpRequestMessage(HttpMethod.Post, GalleryUri) { Content = content };
        request.Headers.Add("X-CSRF-TOKEN", token);
        if (etag is not null) request.Headers.TryAddWithoutValidation("If-Match", etag);
        return await client.SendAsync(request);
    }

    private static async Task<Guid> SeedGalleryImageAsync(MenuApiFactory factory, Guid restaurantId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var image = await AddGalleryImageAsync(db, restaurantId, order: 1);
        await db.SaveChangesAsync();
        return image;
    }

    private static async Task FillGalleryAsync(MenuApiFactory factory, Guid restaurantId, int total)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var existing = await db.GalleryImages.AsNoTracking()
            .Where(item => item.RestaurantId == restaurantId)
            .Select(item => item.DisplayOrder).ToListAsync();
        var next = existing.Count == 0 ? 1 : existing.Max() + 1;
        for (var order = next; order <= total; order++)
        {
            await AddGalleryImageAsync(db, restaurantId, order);
        }
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> AddGalleryImageAsync(MenuDbContext db, Guid restaurantId, int order)
    {
        var restaurant = await db.Restaurants.SingleAsync(item => item.Id == restaurantId);
        var asset = new MediaAssetEntity
        {
            Id = Guid.NewGuid(),
            RestaurantId = restaurantId,
            Restaurant = restaurant,
            AltText = $"Filler photo {order}",
            ProcessingStatus = "ready"
        };
        asset.Variants.Add(new MediaVariantEntity
        {
            Id = Guid.NewGuid(),
            RestaurantId = restaurantId,
            MediaAssetId = asset.Id,
            MediaAsset = asset,
            Url = $"/media/uploads/{GuardedSampleDataSeeder.OrdinaryRestaurantId:N}/poutine-640.webp",
            Width = 640,
            Height = 480
        });
        db.MediaAssets.Add(asset);
        var image = new GalleryImageEntity
        {
            Id = Guid.NewGuid(),
            RestaurantId = restaurantId,
            Restaurant = restaurant,
            MediaAssetId = asset.Id,
            MediaAsset = asset,
            DisplayOrder = order,
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        db.GalleryImages.Add(image);
        return image.Id;
    }
}
