using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Restaurants;
using OmniRest.Api.Security;

namespace OmniRest.Api.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class AdminRestaurantApiTests(PostgresFixture postgres)
{
    private const string Email = "manager@example.test";
    private const string Password = "Correct-Horse-9!Battery";

    [Fact]
    public async Task OwnerCanEditProfilePreviewPublishAndReadCompatiblePublicPhoneContract()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId);
        using var client = CreateSecureClient(factory);

        using var anonymous = await client.GetAsync("/api/v1/admin/restaurant");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        await LoginAsync(client);

        using var draftResponse = await client.GetAsync("/api/v1/admin/restaurant");
        Assert.Equal(HttpStatusCode.OK, draftResponse.StatusCode);
        Assert.True(draftResponse.Headers.CacheControl?.NoStore);
        var draft = await draftResponse.Content.ReadFromJsonAsync<AdminRestaurantResponse>();
        Assert.NotNull(draft);

        var profile = ValidProfile("Prairie Table Updated");
        using var csrfRejected = await PutWithHeadersAsync(
            client, "/api/v1/admin/restaurant/profile", profile, "invalid-token", draft.ETag);
        Assert.Equal(HttpStatusCode.BadRequest, csrfRejected.StatusCode);
        Assert.Contains("csrf_invalid", await csrfRejected.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var token = await GetAntiforgeryAsync(client);
        using var savedResponse = await PutWithHeadersAsync(
            client, "/api/v1/admin/restaurant/profile", profile, token, draft.ETag);
        Assert.Equal(HttpStatusCode.OK, savedResponse.StatusCode);
        var saved = await savedResponse.Content.ReadFromJsonAsync<AdminMutationResponse>();
        Assert.NotNull(saved);
        Assert.Equal(PublicationStatuses.Succeeded, saved.Publication.Status);
        Assert.Equal(saved.Restaurant.DraftVersion, saved.Publication.DraftVersion);
        Assert.NotEqual(draft.ETag, saved.Restaurant.ETag);

        using var stale = await PutWithHeadersAsync(
            client, "/api/v1/admin/restaurant/profile", profile with { Name = "Stale" }, token, draft.ETag);
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Contains("concurrency_conflict", await stale.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var preview = await client.GetAsync("/api/v1/admin/restaurant/preview");
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        Assert.True(preview.Headers.CacheControl?.NoStore);
        Assert.Contains("noindex", preview.Headers.GetValues("X-Robots-Tag").Single(), StringComparison.Ordinal);

        client.DefaultRequestHeaders.Host = "menu.localhost";
        var publicRestaurant = await client.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
        Assert.NotNull(publicRestaurant);
        Assert.Equal("Prairie Table Updated", publicRestaurant.Name);
        Assert.Equal("+12045550123", publicRestaurant.Phone?.E164);
        Assert.Equal("+1 204-555-0123", publicRestaurant.Phone?.Display);
        Assert.Equal("CA", publicRestaurant.Address?.CountryCode);

        var publicMenu = await client.GetFromJsonAsync<OmniRest.Api.Menus.PublicMenuResponse>("/api/v1/public/menu");
        Assert.NotNull(publicMenu?.Menu);
        Assert.Equal("Prairie Table Updated", publicMenu.RestaurantName);
        Assert.Equal("+12045550123", publicMenu.Restaurant?.Phone?.E164);
    }

    [Fact]
    public async Task ScheduleSocialSpecialAndMainImageMutationsAreTransactionalAndTenantSafe()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client);
        var current = await client.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");
        Assert.NotNull(current);

        var token = await GetAntiforgeryAsync(client);
        var regular = new UpdateRegularHoursRequest([
            new AdminRegularHoursDayRequest(1, [new("11:00", "14:00"), new("17:00", "01:00")]),
            new AdminRegularHoursDayRequest(2, [])]);
        var regularResult = await PutMutationAsync(client, "/api/v1/admin/restaurant/regular-hours", regular, token, current.ETag);
        Assert.Equal(7, regularResult.Restaurant.RegularHours.Count);
        Assert.Equal(2, regularResult.Restaurant.RegularHours.Single(item => item.DayOfWeek == 1).Intervals.Count);
        Assert.Empty(regularResult.Restaurant.RegularHours.Single(item => item.DayOfWeek == 2).Intervals);

        token = await GetAntiforgeryAsync(client);
        var socialResult = await PutMutationAsync(client, "/api/v1/admin/restaurant/social-links",
            new UpdateSocialLinksRequest([new("instagram", "https://www.instagram.com/prairie_table")]),
            token, regularResult.Restaurant.ETag);
        Assert.Single(socialResult.Restaurant.SocialLinks);

        token = await GetAntiforgeryAsync(client);
        var specialRequest = new AdminSpecialHoursRequest("2026-12-25", true, "Christmas Day", []);
        using var specialResponse = await SendWithHeadersAsync(
            client, HttpMethod.Post, "/api/v1/admin/special-hours", specialRequest, token, socialResult.Restaurant.ETag);
        Assert.Equal(HttpStatusCode.OK, specialResponse.StatusCode);
        var specialResult = await specialResponse.Content.ReadFromJsonAsync<AdminMutationResponse>();
        Assert.Single(specialResult!.Restaurant.SpecialHours);
        var specialId = Guid.Parse(specialResult.Restaurant.SpecialHours.Single().Id);

        token = await GetAntiforgeryAsync(client);
        var updatedSpecialRequest = new AdminSpecialHoursRequest(
            "2026-12-25", false, "Holiday lunch", [new("11:00", "15:00")]);
        var updatedSpecial = await PutMutationAsync(client, $"/api/v1/admin/special-hours/{specialId}",
            updatedSpecialRequest, token, specialResult.Restaurant.ETag);
        Assert.False(updatedSpecial.Restaurant.SpecialHours.Single().IsClosed);

        token = await GetAntiforgeryAsync(client);
        using var deletedSpecial = await SendWithHeadersAsync(
            client, HttpMethod.Delete, $"/api/v1/admin/special-hours/{specialId}", new { }, token,
            updatedSpecial.Restaurant.ETag);
        Assert.Equal(HttpStatusCode.OK, deletedSpecial.StatusCode);
        var deletedMutation = await deletedSpecial.Content.ReadFromJsonAsync<AdminMutationResponse>();
        var afterSpecialEtag = deletedMutation?.Restaurant.ETag;
        Assert.NotNull(afterSpecialEtag);
        Assert.Equal(deletedMutation!.Publication.OperationId,
            deletedSpecial.Headers.GetValues("X-Publication-Operation-Id").Single());

        Guid ordinaryMedia;
        Guid alternateMedia;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            ordinaryMedia = await db.MediaAssets.Where(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId)
                .Select(item => item.Id).SingleAsync();
            var alternate = await db.Restaurants.SingleAsync(item => item.Id == GuardedSampleDataSeeder.AlternateRestaurantId);
            var media = new MediaAssetEntity
            {
                Id = Guid.NewGuid(),
                RestaurantId = alternate.Id,
                Restaurant = alternate,
                AltText = "Other tenant",
                ProcessingStatus = "ready"
            };
            media.Variants.Add(new MediaVariantEntity
            {
                Id = Guid.NewGuid(),
                RestaurantId = alternate.Id,
                MediaAssetId = media.Id,
                MediaAsset = media,
                Url = "/media/other.webp",
                Width = 640,
                Height = 480
            });
            db.MediaAssets.Add(media);
            await db.SaveChangesAsync();
            alternateMedia = media.Id;
        }

        token = await GetAntiforgeryAsync(client);
        using var crossTenant = await PutWithHeadersAsync(client, "/api/v1/admin/restaurant/main-image",
            new SelectMainImageRequest(alternateMedia), token, afterSpecialEtag);
        Assert.Equal(HttpStatusCode.NotFound, crossTenant.StatusCode);

        token = await GetAntiforgeryAsync(client);
        var imageResult = await PutMutationAsync(client, "/api/v1/admin/restaurant/main-image",
            new SelectMainImageRequest(ordinaryMedia), token, afterSpecialEtag);
        Assert.NotNull(imageResult.Restaurant.MainImage);

        token = await GetAntiforgeryAsync(client);
        using var removed = await SendWithHeadersAsync(
            client, HttpMethod.Delete, "/api/v1/admin/restaurant/main-image", new { }, token, imageResult.Restaurant.ETag);
        Assert.Equal(HttpStatusCode.OK, removed.StatusCode);
        Assert.Null((await removed.Content.ReadFromJsonAsync<AdminMutationResponse>())!.Restaurant.MainImage);

        await using var verifyScope = factory.Services.CreateAsyncScope();
        var verify = verifyScope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(7, await verify.PublicationOutbox.CountAsync());
        Assert.Equal(7, await verify.AuditEvents.CountAsync(item => item.Action.StartsWith("restaurant.")));
        Assert.All(await verify.PublicationOutbox.ToArrayAsync(), item => Assert.Equal(PublicationStatuses.Succeeded, item.Status));
    }

    [Fact]
    public async Task FailedPublicationKeepsPreviousSnapshotAndIdempotentRetryActivatesExactDraft()
    {
        var failure = new ToggleFailurePolicy { Fail = true };
        using var baseFactory = postgres.CreateFactory();
        using var factory = baseFactory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IPublicationFailurePolicy>();
            services.AddSingleton<IPublicationFailurePolicy>(failure);
        }));
        await postgres.RecreateLatestAndSeedAsync((MenuApiFactory)baseFactory);
        await CreateOwnerAsync(baseFactory, GuardedSampleDataSeeder.OrdinaryRestaurantId);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = true,
            AllowAutoRedirect = false
        });
        await LoginAsync(client);
        var current = await client.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");
        var token = await GetAntiforgeryAsync(client);
        using var save = await PutWithHeadersAsync(client, "/api/v1/admin/restaurant/profile",
            ValidProfile("Pending Name"), token, current!.ETag);
        var mutation = await save.Content.ReadFromJsonAsync<AdminMutationResponse>();
        Assert.Equal(PublicationStatuses.Failed, mutation!.Publication.Status);

        client.DefaultRequestHeaders.Host = "menu.localhost";
        var oldPublic = await client.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
        Assert.Equal("Prairie Table", oldPublic!.Name);

        failure.Fail = false;
        client.DefaultRequestHeaders.Host = "localhost";
        token = await GetAntiforgeryAsync(client);
        using var retry = await SendWithHeadersAsync(client, HttpMethod.Post,
            $"/api/v1/admin/publication-status/{mutation.Publication.OperationId}/retry", new { }, token, null);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        var status = await retry.Content.ReadFromJsonAsync<PublicationStatusResponse>();
        Assert.Equal(PublicationStatuses.Succeeded, status!.Status);
        Assert.Equal(2, status.AttemptCount);

        using var secondRetry = await SendWithHeadersAsync(client, HttpMethod.Post,
            $"/api/v1/admin/publication-status/{mutation.Publication.OperationId}/retry", new { },
            await GetAntiforgeryAsync(client), null);
        Assert.Equal(PublicationStatuses.Succeeded,
            (await secondRetry.Content.ReadFromJsonAsync<PublicationStatusResponse>())!.Status);

        client.DefaultRequestHeaders.Host = "menu.localhost";
        var updatedPublic = await client.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
        Assert.Equal("Pending Name", updatedPublic!.Name);
        Assert.Equal(mutation.Publication.DraftVersion, updatedPublic.PublicationVersion);
    }

    [Fact]
    public async Task OwnerCanPreviewAndPublishOnlyAvailableWebsiteDesigns()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client);

        var initial = await client.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");
        Assert.NotNull(initial);
        Assert.Equal(WebsiteDesignIds.LegacyCurrent, initial.DraftDesignId);
        Assert.Equal(WebsiteDesignIds.LegacyCurrent, initial.PublishedDesignId);
        Assert.Equal(4, initial.WebsiteDesigns.Count(design => design.Availability == WebsiteDesignAvailability.Available));
        Assert.Contains(initial.WebsiteDesigns, design =>
            design.Id == WebsiteDesignIds.LegacyCurrent &&
            design.Availability == WebsiteDesignAvailability.Grandfathered);

        using var preview = await client.GetAsync(
            $"/api/v1/admin/website-designs/{WebsiteDesignIds.QuietElegance}/preview");
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        Assert.True(preview.Headers.CacheControl?.NoStore);
        Assert.Contains("noindex", preview.Headers.GetValues("X-Robots-Tag").Single(), StringComparison.Ordinal);
        var previewSite = await preview.Content.ReadFromJsonAsync<OmniRest.Api.Menus.PublicMenuResponse>();
        Assert.Equal(WebsiteDesignIds.QuietElegance, previewSite?.WebsiteDesignId);
        Assert.Equal("Prairie Table", previewSite?.Restaurant?.Name);
        Assert.NotNull(previewSite?.Menu);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            Assert.Empty(await db.PublicationOutbox.ToArrayAsync());
            Assert.Equal(WebsiteDesignIds.LegacyCurrent,
                await db.RestaurantSettings.Where(settings => settings.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId)
                    .Select(settings => settings.WebsiteDesignId).SingleAsync());
        }

        var token = await GetAntiforgeryAsync(client);
        using var rejectedCsrf = await PutWithHeadersAsync(
            client,
            "/api/v1/admin/restaurant/design",
            new UpdateWebsiteDesignRequest(WebsiteDesignIds.QuietElegance),
            "invalid-token",
            initial.ETag);
        Assert.Equal(HttpStatusCode.BadRequest, rejectedCsrf.StatusCode);

        using var rejectedDesign = await PutWithHeadersAsync(
            client,
            "/api/v1/admin/restaurant/design",
            new UpdateWebsiteDesignRequest(WebsiteDesignIds.LegacyCurrent),
            token,
            initial.ETag);
        Assert.Equal(HttpStatusCode.BadRequest, rejectedDesign.StatusCode);
        Assert.Contains("website_design_unavailable", await rejectedDesign.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var mutation = await PutMutationAsync(
            client,
            "/api/v1/admin/restaurant/design",
            new UpdateWebsiteDesignRequest(WebsiteDesignIds.QuietElegance),
            token,
            initial.ETag);
        Assert.Equal(PublicationStatuses.Succeeded, mutation.Publication.Status);
        Assert.Equal(WebsiteDesignIds.QuietElegance, mutation.Restaurant.DraftDesignId);
        Assert.Equal(WebsiteDesignIds.QuietElegance, mutation.Restaurant.PublishedDesignId);

        client.DefaultRequestHeaders.Host = "menu.localhost";
        var published = await client.GetFromJsonAsync<OmniRest.Api.Menus.PublicMenuResponse>("/api/v1/public/menu");
        Assert.Equal(WebsiteDesignIds.QuietElegance, published?.WebsiteDesignId);
        Assert.Equal(WebsiteDesignIds.QuietElegance, published?.Restaurant?.WebsiteDesignId);
    }

    [Fact]
    public async Task FailedWebsiteDesignPublicationKeepsPublishedDesignDistinctUntilSafeRetry()
    {
        var failure = new ToggleFailurePolicy { Fail = true };
        using var baseFactory = postgres.CreateFactory();
        using var factory = baseFactory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IPublicationFailurePolicy>();
            services.AddSingleton<IPublicationFailurePolicy>(failure);
        }));
        await postgres.RecreateLatestAndSeedAsync((MenuApiFactory)baseFactory);
        await CreateOwnerAsync(baseFactory, GuardedSampleDataSeeder.OrdinaryRestaurantId);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client);
        var current = await client.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");

        var mutation = await PutMutationAsync(
            client,
            "/api/v1/admin/restaurant/design",
            new UpdateWebsiteDesignRequest(WebsiteDesignIds.Nightfall),
            await GetAntiforgeryAsync(client),
            current!.ETag);
        Assert.Equal(PublicationStatuses.Failed, mutation.Publication.Status);
        Assert.Equal(WebsiteDesignIds.Nightfall, mutation.Restaurant.DraftDesignId);
        Assert.Equal(WebsiteDesignIds.LegacyCurrent, mutation.Restaurant.PublishedDesignId);

        client.DefaultRequestHeaders.Host = "menu.localhost";
        var unchanged = await client.GetFromJsonAsync<OmniRest.Api.Menus.PublicMenuResponse>("/api/v1/public/menu");
        Assert.Equal(WebsiteDesignIds.LegacyCurrent, unchanged?.WebsiteDesignId);

        failure.Fail = false;
        client.DefaultRequestHeaders.Host = "localhost";
        using var retry = await SendWithHeadersAsync(
            client,
            HttpMethod.Post,
            $"/api/v1/admin/publication-status/{mutation.Publication.OperationId}/retry",
            new { },
            await GetAntiforgeryAsync(client),
            null);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        Assert.Equal(PublicationStatuses.Succeeded,
            (await retry.Content.ReadFromJsonAsync<PublicationStatusResponse>())?.Status);

        var afterRetry = await client.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");
        Assert.Equal(WebsiteDesignIds.Nightfall, afterRetry?.DraftDesignId);
        Assert.Equal(WebsiteDesignIds.Nightfall, afterRetry?.PublishedDesignId);
    }

    [Fact]
    public async Task SupersededWebsiteDesignRetryCannotRollbackNewerPublication()
    {
        var failure = new ToggleFailurePolicy { Fail = true };
        using var baseFactory = postgres.CreateFactory();
        using var factory = baseFactory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IPublicationFailurePolicy>();
            services.AddSingleton<IPublicationFailurePolicy>(failure);
        }));
        await postgres.RecreateLatestAndSeedAsync((MenuApiFactory)baseFactory);
        await CreateOwnerAsync(baseFactory, GuardedSampleDataSeeder.OrdinaryRestaurantId);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client);
        var current = await client.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");

        var first = await PutMutationAsync(
            client,
            "/api/v1/admin/restaurant/design",
            new UpdateWebsiteDesignRequest(WebsiteDesignIds.Nightfall),
            await GetAntiforgeryAsync(client),
            current!.ETag);
        Assert.Equal(PublicationStatuses.Failed, first.Publication.Status);

        failure.Fail = false;
        var second = await PutMutationAsync(
            client,
            "/api/v1/admin/restaurant/design",
            new UpdateWebsiteDesignRequest(WebsiteDesignIds.Broadsheet),
            await GetAntiforgeryAsync(client),
            first.Restaurant.ETag);
        Assert.Equal(PublicationStatuses.Succeeded, second.Publication.Status);
        Assert.True(long.Parse(second.Publication.DraftVersion) > long.Parse(first.Publication.DraftVersion));

        using var staleRetry = await SendWithHeadersAsync(
            client,
            HttpMethod.Post,
            $"/api/v1/admin/publication-status/{first.Publication.OperationId}/retry",
            new { },
            await GetAntiforgeryAsync(client),
            null);
        Assert.Equal(HttpStatusCode.Conflict, staleRetry.StatusCode);
        Assert.Contains(
            "publication_retry_superseded",
            await staleRetry.Content.ReadAsStringAsync(),
            StringComparison.Ordinal);

        var firstOperationId = Guid.Parse(first.Publication.OperationId);
        var secondOperationId = Guid.Parse(second.Publication.OperationId);
        await using (var verifyScope = factory.Services.CreateAsyncScope())
        {
            var verify = verifyScope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var stale = await verify.PublicationOutbox.AsNoTracking()
                .SingleAsync(item => item.OperationId == firstOperationId);
            Assert.Equal(PublicationStatuses.Failed, stale.Status);
            Assert.Equal(PublicationOrdering.SupersededErrorCode, stale.ErrorCode);
            Assert.Equal(1, stale.AttemptCount);
            Assert.DoesNotContain(
                await verify.Publications.Where(item => item.RestaurantId == stale.RestaurantId).ToArrayAsync(),
                item => item.OperationId == firstOperationId);
            var currentPublication = await verify.Publications.AsNoTracking().SingleAsync(
                item => item.RestaurantId == stale.RestaurantId && item.IsCurrent);
            Assert.Equal(secondOperationId, currentPublication.OperationId);
            Assert.Equal(long.Parse(second.Publication.DraftVersion), currentPublication.Version);
        }

        client.DefaultRequestHeaders.Host = "menu.localhost";
        var publicAfterRejectedRetry =
            await client.GetFromJsonAsync<OmniRest.Api.Menus.PublicMenuResponse>("/api/v1/public/menu");
        Assert.Equal(WebsiteDesignIds.Broadsheet, publicAfterRejectedRetry?.WebsiteDesignId);
        Assert.Equal(second.Publication.DraftVersion, publicAfterRejectedRetry?.PublicationVersion);

        client.DefaultRequestHeaders.Host = "localhost";
        await using (var setupScope = factory.Services.CreateAsyncScope())
        {
            var setup = setupScope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var stale = await setup.PublicationOutbox.SingleAsync(
                item => item.OperationId == firstOperationId);
            stale.Status = PublicationStatuses.Pending;
            stale.ErrorCode = null;
            stale.CompletedAt = null;
            stale.UpdatedAt = DateTimeOffset.UtcNow;
            await setup.SaveChangesAsync();
        }
        await using (var dispatchScope = factory.Services.CreateAsyncScope())
        {
            var dispatcher = dispatchScope.ServiceProvider.GetRequiredService<IInProcessPublicationDispatcher>();
            await dispatcher.DispatchAsync(firstOperationId, CancellationToken.None);
        }
        await using (var verifyScope = factory.Services.CreateAsyncScope())
        {
            var verify = verifyScope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var stale = await verify.PublicationOutbox.AsNoTracking()
                .SingleAsync(item => item.OperationId == firstOperationId);
            Assert.Equal(PublicationStatuses.Failed, stale.Status);
            Assert.Equal(PublicationOrdering.SupersededErrorCode, stale.ErrorCode);
            Assert.True(stale.AttemptCount >= 2);
            Assert.DoesNotContain(
                await verify.Publications.Where(item => item.RestaurantId == stale.RestaurantId).ToArrayAsync(),
                item => item.OperationId == firstOperationId);
            Assert.Equal(
                secondOperationId,
                (await verify.Publications.AsNoTracking().SingleAsync(
                    item => item.RestaurantId == stale.RestaurantId && item.IsCurrent)).OperationId);
        }

        client.DefaultRequestHeaders.Host = "menu.localhost";
        var publicAfterDefensiveDispatch =
            await client.GetFromJsonAsync<OmniRest.Api.Menus.PublicMenuResponse>("/api/v1/public/menu");
        Assert.Equal(WebsiteDesignIds.Broadsheet, publicAfterDefensiveDispatch?.WebsiteDesignId);
        Assert.Equal(second.Publication.DraftVersion, publicAfterDefensiveDispatch?.PublicationVersion);
    }

    [Fact]
    public async Task ReadyMediaUploadListingAltTextSelectionAndTenantIsolationUseValidatedBytes()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client);
        var current = await client.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");
        Assert.NotNull(current);

        var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
        using (var mismatched = await UploadAsync(client, png, "text/plain", "Validated dining room", await GetAntiforgeryAsync(client)))
        {
            Assert.Equal(HttpStatusCode.BadRequest, mismatched.StatusCode);
            Assert.Contains("media_content_invalid", await mismatched.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }

        using var uploadedResponse = await UploadAsync(client, png, "image/png", "Validated dining room", await GetAntiforgeryAsync(client));
        Assert.Equal(HttpStatusCode.Created, uploadedResponse.StatusCode);
        var uploaded = await uploadedResponse.Content.ReadFromJsonAsync<AdminMediaAssetResponse>();
        Assert.NotNull(uploaded);
        Assert.Equal("ready", uploaded.ProcessingStatus);
        Assert.Single(uploaded.Variants);
        Assert.Equal((1, 1), (uploaded.Variants[0].Width, uploaded.Variants[0].Height));

        var ready = await client.GetFromJsonAsync<AdminMediaAssetResponse[]>("/api/v1/admin/media-assets");
        Assert.Contains(ready!, item => item.Id == uploaded.Id);

        var token = await GetAntiforgeryAsync(client);
        var alt = await PutMutationAsync(client, $"/api/v1/admin/media-assets/{uploaded.Id}/alt-text",
            new UpdateMediaAltTextRequest("Accessible dining room"), token, current.ETag);
        token = await GetAntiforgeryAsync(client);
        var selected = await PutMutationAsync(client, "/api/v1/admin/restaurant/main-image",
            new SelectMainImageRequest(Guid.Parse(uploaded.Id)), token, alt.Restaurant.ETag);
        Assert.Equal("Accessible dining room", selected.Restaurant.MainImage?.AltText);

        client.DefaultRequestHeaders.Host = "menu.localhost";
        var publicRestaurant = await client.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
        Assert.Equal("Accessible dining room", publicRestaurant!.MainImage?.AltText);
        using var storedBytes = await client.GetAsync(uploaded.Variants[0].Url);
        Assert.Equal(HttpStatusCode.OK, storedBytes.StatusCode);
        Assert.Equal("image/png", storedBytes.Content.Headers.ContentType?.MediaType);
        Assert.Equal(png, await storedBytes.Content.ReadAsByteArrayAsync());

        Guid otherTenantAsset;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var other = await db.Restaurants.SingleAsync(item => item.Id == GuardedSampleDataSeeder.AlternateRestaurantId);
            var asset = new MediaAssetEntity { Id = Guid.NewGuid(), RestaurantId = other.Id, Restaurant = other, AltText = "Private other tenant", ProcessingStatus = "ready" };
            db.MediaAssets.Add(asset); await db.SaveChangesAsync(); otherTenantAsset = asset.Id;
        }
        client.DefaultRequestHeaders.Host = "localhost";
        ready = await client.GetFromJsonAsync<AdminMediaAssetResponse[]>("/api/v1/admin/media-assets");
        Assert.DoesNotContain(ready!, item => item.Id == otherTenantAsset.ToString());
        using var denied = await PutWithHeadersAsync(client, $"/api/v1/admin/media-assets/{otherTenantAsset}/alt-text",
            new UpdateMediaAltTextRequest("Cannot edit"), await GetAntiforgeryAsync(client), selected.Restaurant.ETag);
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
    }

    [Fact]
    public async Task ProcessingClaimSurvivesCancellationAndFreshHostRecoversPendingWorkIdempotently()
    {
        var cancellation = new CancellationTokenSource();
        var policy = new CancelDispatchPolicy(cancellation);
        using var baseFactory = postgres.CreateFactory();
        using var crashFactory = baseFactory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("PublicationDispatcher:PollInterval", "01:00:00");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IPublicationFailurePolicy>();
                services.AddSingleton<IPublicationFailurePolicy>(policy);
            });
        });
        await postgres.RecreateLatestAndSeedAsync(baseFactory);
        _ = crashFactory.CreateClient();

        Guid operationId;
        Guid previousPublicationId;
        await using (var scope = baseFactory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var current = await db.Publications.SingleAsync(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId && item.IsCurrent);
            previousPublicationId = current.Id;
            operationId = Guid.NewGuid();
            db.PublicationOutbox.Add(new PublicationOutboxEntity
            {
                OperationId = operationId,
                RestaurantId = current.RestaurantId,
                DraftVersion = current.Version + 1,
                DraftSnapshotJson = current.SnapshotJson,
                Status = PublicationStatuses.Pending,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }

        await using (var scope = crashFactory.Services.CreateAsyncScope())
        {
            var dispatcher = scope.ServiceProvider.GetRequiredService<IInProcessPublicationDispatcher>();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => dispatcher.DispatchAsync(operationId, cancellation.Token));
        }
        await using (var scope = baseFactory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var stranded = await db.PublicationOutbox.SingleAsync(item => item.OperationId == operationId);
            Assert.Equal(PublicationStatuses.Processing, stranded.Status);
            Assert.Equal(1, stranded.AttemptCount);
            Assert.Equal(previousPublicationId, (await db.Publications.SingleAsync(item => item.IsCurrent && item.RestaurantId == stranded.RestaurantId)).Id);
            stranded.UpdatedAt = DateTimeOffset.UtcNow - TimeSpan.FromMinutes(2);
            await db.SaveChangesAsync();
        }

        crashFactory.Dispose();
        using var restartBase = postgres.CreateFactory();
        using var restart = restartBase.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("PublicationDispatcher:Enabled", "true");
            builder.UseSetting("PublicationDispatcher:PollInterval", "00:00:00.050");
            builder.UseSetting("PublicationDispatcher:ClaimLease", "00:00:00.010");
        });
        _ = restart.CreateClient();
        PublicationOutboxEntity? recovered = null;
        for (var attempt = 0; attempt < 100; attempt++)
        {
            await Task.Delay(50);
            await using var scope = restart.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            recovered = await db.PublicationOutbox.AsNoTracking().SingleAsync(item => item.OperationId == operationId);
            if (recovered.Status == PublicationStatuses.Succeeded) break;
        }
        Assert.Equal(PublicationStatuses.Succeeded, recovered?.Status);
        Assert.Equal(2, recovered?.AttemptCount);
        await using (var scope = restart.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            Assert.Equal(operationId, (await db.Publications.SingleAsync(item => item.IsCurrent && item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId)).OperationId);
            Assert.Single(await db.Publications.Where(item => item.OperationId == operationId).ToArrayAsync());
        }
    }

    [Fact]
    public async Task MalformedNullableJsonShapesReturnStableValidationProblems()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client);
        var current = await client.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");
        Assert.NotNull(current);
        var cases = new[]
        {
            (HttpMethod.Put, "/api/v1/admin/restaurant/profile", "{\"name\":\"Valid\",\"timeZone\":\"UTC\",\"address\":null}"),
            (HttpMethod.Put, "/api/v1/admin/restaurant/regular-hours", "{\"days\":[null]}"),
            (HttpMethod.Put, "/api/v1/admin/restaurant/regular-hours", "{\"days\":[{\"dayOfWeek\":1,\"intervals\":[null]}]}"),
            (HttpMethod.Post, "/api/v1/admin/special-hours", "{\"date\":\"2026-12-25\",\"isClosed\":false,\"intervals\":null}"),
            (HttpMethod.Put, "/api/v1/admin/restaurant/social-links", "{\"links\":[null]}"),
            (HttpMethod.Put, "/api/v1/admin/restaurant/main-image", "null")
        };
        foreach (var item in cases)
        {
            var request = new HttpRequestMessage(item.Item1, item.Item2)
            {
                Content = new StringContent(item.Item3, System.Text.Encoding.UTF8, "application/json")
            };
            request.Headers.Add("X-CSRF-TOKEN", await GetAntiforgeryAsync(client));
            request.Headers.TryAddWithoutValidation("If-Match", current.ETag);
            using var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Contains("admin_validation", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        }
    }

    private static UpdateRestaurantProfileRequest ValidProfile(string name) => new(
        name, "Seasonal local food", "+12045550123", "+1 204-555-0123", "hello@example.test",
        "America/Winnipeg", new AdminAddressRequest(
            "1 Main Street", null, "Winnipeg", "MB", "R3C 0V8", "CA", 49.8951m, -97.1384m));

    private static HttpClient CreateSecureClient(WebApplicationFactory<Program> factory) => factory.CreateClient(
        new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = true,
            AllowAutoRedirect = false
        });

    private static async Task LoginAsync(HttpClient client)
    {
        var token = await GetAntiforgeryAsync(client);
        using var response = await SendWithHeadersAsync(client, HttpMethod.Post, "/api/v1/auth/login",
            new LoginRequest(Email, Password, null), token, null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static async Task<string> GetAntiforgeryAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<AntiforgeryResponse>("/api/v1/auth/antiforgery"))!.Token;

    private static Task<HttpResponseMessage> PutWithHeadersAsync<T>(HttpClient client, string uri, T body, string token, string etag) =>
        SendWithHeadersAsync(client, HttpMethod.Put, uri, body, token, etag);

    private static async Task<AdminMutationResponse> PutMutationAsync<T>(
        HttpClient client, string uri, T body, string token, string etag)
    {
        using var response = await PutWithHeadersAsync(client, uri, body, token, etag);
        var payload = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"Expected 200 but received {(int)response.StatusCode}: {payload}");
        return System.Text.Json.JsonSerializer.Deserialize<AdminMutationResponse>(
            payload, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!;
    }

    private static async Task<HttpResponseMessage> SendWithHeadersAsync<T>(
        HttpClient client, HttpMethod method, string uri, T body, string token, string? etag)
    {
        var request = new HttpRequestMessage(method, uri) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token);
        if (etag is not null) request.Headers.TryAddWithoutValidation("If-Match", etag);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> UploadAsync(
        HttpClient client, byte[] bytes, string contentType, string altText, string token)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
        var content = new MultipartFormDataContent();
        content.Add(file, "file", "image.png");
        content.Add(new StringContent(altText), "altText");
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/admin/media-assets") { Content = content };
        request.Headers.Add("X-CSRF-TOKEN", token);
        return await client.SendAsync(request);
    }

    private static async Task CreateOwnerAsync(MenuApiFactory factory, Guid restaurantId)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<OwnerUser>>();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var user = new OwnerUser
        {
            Id = Guid.NewGuid(),
            Email = Email,
            UserName = Email,
            EmailConfirmed = true,
            DisplayName = "Manager",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var created = await userManager.CreateAsync(user, Password);
        Assert.True(created.Succeeded, string.Join(",", created.Errors.Select(item => item.Code)));
        db.RestaurantMemberships.Add(new RestaurantMembershipEntity
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            RestaurantId = restaurantId,
            Role = MembershipRoles.Owner,
            Status = MembershipStatuses.Active,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
    }

    private sealed class ToggleFailurePolicy : IPublicationFailurePolicy
    {
        public bool Fail { get; set; }
        public bool ShouldFail(Guid operationId) => Fail;
    }

    private sealed class CancelDispatchPolicy(CancellationTokenSource cancellation) : IPublicationFailurePolicy
    {
        public bool ShouldFail(Guid operationId)
        {
            cancellation.Cancel();
            return false;
        }
    }
}
