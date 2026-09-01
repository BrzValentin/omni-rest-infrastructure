using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;
using static OmniRest.Api.Tests.Integration.OwnerApiHarness;

namespace OmniRest.Api.Tests.Integration;

/// <summary>
/// Phase 7 tenant isolation (PR-20 Tasks 2, 3, 4 and PR-21 Task 11). The seeded fixture already holds
/// five restaurants, so these tests use the ordinary and alternate tenants as the two sides of every
/// cross-tenant probe rather than seeding a sixth.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class TenantIsolationApiTests(PostgresFixture postgres)
{
    private const string OrdinaryEmail = "isolation-ordinary@example.test";
    private const string AlternateEmail = "isolation-alternate@example.test";

    /// <summary>
    /// The ambient tenant scope is what makes isolation automatic (PR-20 Task 4), so this asserts the
    /// mechanism directly at the ORM boundary rather than only through HTTP: every restaurant-owned set
    /// must come back scoped once a tenant is bound, and unscoped again when the binding is suppressed.
    /// </summary>
    [Fact]
    public async Task BoundTenantScopeFiltersEveryRestaurantOwnedSetAndSuppressionRestoresFullAccess()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);

        // 1. Unbound: the seeder and background workers rely on seeing every tenant.
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            Assert.Equal(5, await db.Restaurants.CountAsync());
            Assert.Equal(5, await db.RestaurantDomains.CountAsync());
        }

        // 2. Bound to the ordinary restaurant: every set is scoped, with no predicate in the query.
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var tenantScope = scope.ServiceProvider.GetRequiredService<ITenantScope>();
            tenantScope.Bind(GuardedSampleDataSeeder.OrdinaryRestaurantId);
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();

            var ordinary = GuardedSampleDataSeeder.OrdinaryRestaurantId;
            Assert.Equal(ordinary, (await db.Restaurants.SingleAsync()).Id);
            Assert.All(await db.RestaurantDomains.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.RestaurantSettings.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.Menus.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.MenuCategories.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.Dishes.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.Badges.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.DishBadges.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.MediaAssets.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.MediaVariants.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.GalleryImages.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.Publications.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.SocialLinks.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));
            Assert.All(await db.RestaurantMemberships.ToListAsync(), item => Assert.Equal(ordinary, item.RestaurantId));

            // The alternate tenant's private asset is unreachable even when its id is known exactly.
            Assert.Null(await db.MediaAssets
                .SingleOrDefaultAsync(item => item.Id == GuardedSampleDataSeeder.AlternateMediaAssetId));
            Assert.Null(await db.Restaurants
                .SingleOrDefaultAsync(item => item.Id == GuardedSampleDataSeeder.AlternateRestaurantId));

            // 3. Suppression is the documented escape hatch for legitimately cross-tenant work.
            using (tenantScope.Suppress())
            {
                Assert.Equal(5, await db.Restaurants.CountAsync());
                Assert.NotNull(await db.MediaAssets
                    .SingleOrDefaultAsync(item => item.Id == GuardedSampleDataSeeder.AlternateMediaAssetId));
            }

            // 4. The binding is restored when the suppression ends.
            Assert.Equal(1, await db.Restaurants.CountAsync());
        }

        // 5. A request may never straddle two tenants.
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var tenantScope = scope.ServiceProvider.GetRequiredService<ITenantScope>();
            tenantScope.Bind(GuardedSampleDataSeeder.OrdinaryRestaurantId);
            tenantScope.Bind(GuardedSampleDataSeeder.OrdinaryRestaurantId);
            Assert.Throws<InvalidOperationException>(
                () => tenantScope.Bind(GuardedSampleDataSeeder.AlternateRestaurantId));
        }
    }

    /// <summary>
    /// PR-20 Task 2: a restaurant resolves by custom domain and by slug beneath a configured platform
    /// base domain, and an unresolvable host is a 404 rather than a fallback to some other tenant.
    /// </summary>
    [Fact]
    public async Task RestaurantResolvesByCustomDomainAndBySubdomainSlugAndUnknownHostsAreNotFound()
    {
        using var seedFactory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(seedFactory);

        // Subdomain resolution is opt-in per deployment, so the base domain is configured here.
        using var factory = seedFactory.WithWebHostBuilder(builder =>
            builder.UseSetting("PublicMenu:PlatformBaseDomains:0", "example.app"));
        using var client = factory.CreateClient();

        // 1. Custom domain, the strategy that already existed.
        var byDomain = await ReadRestaurantAsync(client, "menu.localhost");
        Assert.Equal(HttpStatusCode.OK, byDomain.Status);
        Assert.Equal("Prairie Table", byDomain.Name);

        // 2. Slug beneath the platform base domain, with no restaurant_domains row for this host.
        var bySubdomain = await ReadRestaurantAsync(client, "menu.example.app");
        Assert.Equal(HttpStatusCode.OK, bySubdomain.Status);
        Assert.Equal("Prairie Table", bySubdomain.Name);

        // 3. A different slug reaches a different restaurant, so the strategy really keys on the label.
        var alternate = await ReadRestaurantAsync(client, "alternate.example.app");
        Assert.Equal(HttpStatusCode.OK, alternate.Status);
        Assert.Equal("Café Boréal", alternate.Name);

        // 4. Unknown slug, unknown domain, and a deeper label that must not be treated as a tenant.
        foreach (var host in new[] { "nobody.example.app", "unknown.localhost", "a.menu.example.app" })
        {
            var unresolved = await ReadRestaurantAsync(client, host);
            Assert.Equal(HttpStatusCode.NotFound, unresolved.Status);
        }
    }

    /// <summary>
    /// PR-21 Task 11: an owner edits their own restaurant, cannot reach the other tenant's data through
    /// the same authenticated session, and anonymous callers are refused outright.
    /// </summary>
    [Fact]
    public async Task OwnersReachOnlyTheirOwnRestaurantAndAnonymousCallersAreRefused()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, OrdinaryEmail);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.AlternateRestaurantId, AlternateEmail);

        // 1. Anonymous is refused before any tenant is involved.
        using var anonymous = CreateSecureClient(factory);
        using var anonymousRead = await anonymous.GetAsync("/api/v1/admin/restaurant");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousRead.StatusCode);

        // 2. Each owner sees exactly their own restaurant, with no restaurant id anywhere in the request.
        using var ordinaryClient = CreateSecureClient(factory);
        await LoginAsync(ordinaryClient, OrdinaryEmail);
        var ordinary = await ordinaryClient.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");
        Assert.NotNull(ordinary);
        Assert.Equal(GuardedSampleDataSeeder.OrdinaryRestaurantId.ToString("D"), ordinary.Id);

        using var alternateClient = CreateSecureClient(factory);
        await LoginAsync(alternateClient, AlternateEmail);
        var alternate = await alternateClient.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");
        Assert.NotNull(alternate);
        Assert.Equal(GuardedSampleDataSeeder.AlternateRestaurantId.ToString("D"), alternate.Id);
        Assert.NotEqual(ordinary.Name, alternate.Name);

        // 3. The alternate owner's gallery and menu are disjoint from the ordinary owner's.
        var ordinaryGallery = await ordinaryClient.GetFromJsonAsync<AdminGalleryResponse>("/api/v1/admin/gallery");
        var alternateGallery = await alternateClient.GetFromJsonAsync<AdminGalleryResponse>("/api/v1/admin/gallery");
        Assert.NotNull(ordinaryGallery);
        Assert.NotNull(alternateGallery);
        Assert.Empty(ordinaryGallery.Images.Select(item => item.Id)
            .Intersect(alternateGallery.Images.Select(item => item.Id)));

        // 4. An edit by one owner does not disturb the other's configuration.
        var beforeAlternate = alternate.Name;
        var token = await GetAntiforgeryAsync(ordinaryClient);
        using var rename = await SendAsync(ordinaryClient, HttpMethod.Put, "/api/v1/admin/restaurant/profile",
            new UpdateRestaurantProfileRequest(
                "Prairie Table Renamed", "Seasonal local food", "+12045550123", "+1 204-555-0123",
                "hello@example.test", "America/Winnipeg",
                new AdminAddressRequest("1 Main Street", null, "Winnipeg", "MB", "R3C 0V8", "CA", 49.8951m, -97.1384m)),
            token, ordinary.ETag);
        Assert.Equal(HttpStatusCode.OK, rename.StatusCode);

        var alternateAfter = await alternateClient.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");
        Assert.NotNull(alternateAfter);
        Assert.Equal(beforeAlternate, alternateAfter.Name);
        Assert.Equal(GuardedSampleDataSeeder.AlternateRestaurantId.ToString("D"), alternateAfter.Id);
    }

    private static async Task<(HttpStatusCode Status, string? Name)> ReadRestaurantAsync(HttpClient client, string host)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/public/restaurant");
        request.Headers.Host = host;
        using var response = await client.SendAsync(request);
        if (response.StatusCode != HttpStatusCode.OK)
        {
            return (response.StatusCode, null);
        }

        var payload = await response.Content.ReadFromJsonAsync<PublicRestaurantResponse>();
        return (response.StatusCode, payload?.Name);
    }
}
