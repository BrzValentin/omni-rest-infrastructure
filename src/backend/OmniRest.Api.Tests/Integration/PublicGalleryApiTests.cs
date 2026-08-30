using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;
using static OmniRest.Api.Tests.Integration.OwnerApiHarness;

namespace OmniRest.Api.Tests.Integration;

/// <summary>
/// Backend coverage for the public gallery read required by
/// <c>specifications/phase-5/pr-15-public-gallery.md</c> section 6.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class PublicGalleryApiTests(PostgresFixture postgres)
{
    private const string Email = "public-gallery@example.test";
    private const string GalleryPath = "/api/v1/public/restaurant/gallery";
    private const string AdminGalleryUri = "/api/v1/admin/gallery";
    private const string MenuHost = "menu.localhost";

    [Fact]
    public async Task PublicGalleryReturnsOnlyActivePhotosInDisplayOrderWithRevalidationHeaders()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        using var client = factory.CreateClient();

        using var response = await GetGalleryAsync(client, MenuHost);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.Public);
        Assert.True(response.Headers.CacheControl?.MustRevalidate);
        Assert.Equal(TimeSpan.Zero, response.Headers.CacheControl?.MaxAge);
        Assert.NotNull(response.Headers.ETag);

        var body = await response.Content.ReadFromJsonAsync<PublicGalleryResponse>();
        Assert.NotNull(body);
        Assert.Equal("1", body.PublicationVersion);

        // The seed holds four photos, the last of which is inactive.
        Assert.Equal(3, body.Images.Count);
        Assert.Equal(
            [
                "The dining room at golden hour",
                "The chef plating a prairie main",
                "The bar with prairie spirits"
            ],
            body.Images.Select(item => item.AltText));
        Assert.DoesNotContain(body.Images, item => item.AltText.Contains("patio", StringComparison.OrdinalIgnoreCase));
        Assert.All(body.Images, item => Assert.NotEmpty(item.ImageUrl));
        Assert.All(body.Images, item => Assert.NotEmpty(item.ThumbnailUrl));
        Assert.All(body.Images, item => Assert.True(item.Width > 0 && item.Height > 0));
        Assert.All(body.Images, item => Assert.True(item.ThumbnailWidth > 0 && item.ThumbnailHeight > 0));
        Assert.Equal(body.Images.Select(item => item.Id).Distinct().Count(), body.Images.Count);
    }

    [Fact]
    public async Task MatchingIfNoneMatchReturnsNotModifiedWithNoBody()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        using var client = factory.CreateClient();

        using var first = await GetGalleryAsync(client, MenuHost);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var etag = first.Headers.ETag;
        Assert.NotNull(etag);

        using var conditional = new HttpRequestMessage(HttpMethod.Get, GalleryPath);
        conditional.Headers.Host = MenuHost;
        conditional.Headers.IfNoneMatch.Add(etag);
        using var notModified = await client.SendAsync(conditional);

        Assert.Equal(HttpStatusCode.NotModified, notModified.StatusCode);
        Assert.Equal(0, notModified.Content.Headers.ContentLength ?? 0);
        Assert.Equal(etag.Tag, notModified.Headers.ETag?.Tag);
    }

    [Fact]
    public async Task UnknownHostReturnsProblemDetailsNotFound()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        using var client = factory.CreateClient();

        using var unknown = await GetGalleryAsync(client, "unknown.localhost");

        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("application/problem+json", unknown.Content.Headers.ContentType?.MediaType);
        var problem = await unknown.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(404, problem.GetProperty("status").GetInt32());
        Assert.Contains("public_restaurant_not_found", problem.ToString(), StringComparison.Ordinal);

        // A host with no publication at all is equally a 404, not an empty gallery.
        using var unpublished = await GetGalleryAsync(client, "no-menu.localhost");
        Assert.Equal(HttpStatusCode.NotFound, unpublished.StatusCode);
    }

    [Fact]
    public async Task ARestaurantWithNoPhotosReturnsAnEmptyListRatherThanAnError()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        using var client = factory.CreateClient();

        // The alternate tenant is published but seeds no gallery rows.
        using var response = await GetGalleryAsync(client, "alternate.localhost");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(response.Headers.ETag);
        var body = await response.Content.ReadFromJsonAsync<PublicGalleryResponse>();
        Assert.NotNull(body);
        Assert.Equal("3", body.PublicationVersion);
        Assert.Empty(body.Images);
    }

    [Fact]
    public async Task AGalleryChangeRepublishesSoThePublicResponseChangesWithIt()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var visitor = factory.CreateClient();
        using var owner = CreateSecureClient(factory);
        await LoginAsync(owner, Email);

        using var before = await GetGalleryAsync(visitor, MenuHost);
        Assert.Equal(HttpStatusCode.OK, before.StatusCode);
        var staleETag = before.Headers.ETag;
        Assert.NotNull(staleETag);
        var beforeBody = await before.Content.ReadFromJsonAsync<PublicGalleryResponse>();
        Assert.NotNull(beforeBody);
        Assert.Equal(3, beforeBody.Images.Count);

        var gallery = await owner.GetFromJsonAsync<AdminGalleryResponse>(AdminGalleryUri);
        Assert.NotNull(gallery);
        var hidden = gallery.Images[0];
        using var patched = await SendAsync(
            owner,
            HttpMethod.Patch,
            $"{AdminGalleryUri}/{hidden.Id}",
            new UpdateGalleryImageRequest(hidden.AltText, hidden.Caption, IsActive: false),
            await GetAntiforgeryAsync(owner),
            gallery.ETag);
        Assert.Equal(HttpStatusCode.OK, patched.StatusCode);

        // The gallery travels inside the publication snapshot, so the ordinary dispatch republishes it and
        // the previously valid ETag no longer revalidates.
        using var conditional = new HttpRequestMessage(HttpMethod.Get, GalleryPath);
        conditional.Headers.Host = MenuHost;
        conditional.Headers.IfNoneMatch.Add(staleETag);
        using var after = await visitor.SendAsync(conditional);

        Assert.Equal(HttpStatusCode.OK, after.StatusCode);
        Assert.NotEqual(staleETag.Tag, after.Headers.ETag?.Tag);
        var afterBody = await after.Content.ReadFromJsonAsync<PublicGalleryResponse>();
        Assert.NotNull(afterBody);
        Assert.NotEqual(beforeBody.PublicationVersion, afterBody.PublicationVersion);
        Assert.Equal(2, afterBody.Images.Count);
        Assert.DoesNotContain(afterBody.Images, item => item.Id == hidden.Id);
        Assert.Equal(
            beforeBody.Images.Skip(1).Select(item => item.Id),
            afterBody.Images.Select(item => item.Id));
    }

    private static Task<HttpResponseMessage> GetGalleryAsync(HttpClient client, string host)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, GalleryPath);
        request.Headers.Host = host;
        return client.SendAsync(request);
    }
}
