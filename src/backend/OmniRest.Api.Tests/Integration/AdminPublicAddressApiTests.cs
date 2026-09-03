using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Restaurants;
using static OmniRest.Api.Tests.Integration.OwnerApiHarness;

namespace OmniRest.Api.Tests.Integration;

/// <summary>
/// PR-26: the owner dashboard needs the tenant's public host to build a QR code, and it cannot read that
/// off its own request host because the portal may be served somewhere else entirely. The seeded fixture
/// already holds an ordinary and an alternate tenant, each with one <c>restaurant_domains</c> row, so
/// these use those two as the sides of the cross-restaurant probe.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class AdminPublicAddressApiTests(PostgresFixture postgres)
{
    private const string Endpoint = "/api/v1/admin/restaurant/public-address";
    private const string OrdinaryEmail = "public-address-ordinary@example.test";
    private const string AlternateEmail = "public-address-alternate@example.test";

    /// <summary>
    /// PR-26 Task 6. The tenant comes from membership and never from the request, so two owners hitting
    /// the identical URL must receive their own host and never each other's.
    /// </summary>
    [Fact]
    public async Task EachOwnerReadsTheirOwnPublicHostAndAnonymousCallersAreRefused()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, OrdinaryEmail);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.AlternateRestaurantId, AlternateEmail);

        // 1. Anonymous is refused before any tenant is involved.
        using var anonymous = CreateSecureClient(factory);
        using var anonymousRead = await anonymous.GetAsync(Endpoint);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousRead.StatusCode);

        // 2. Each owner gets the host of their own restaurant, with no restaurant id in the request.
        using var ordinaryClient = CreateSecureClient(factory);
        await LoginAsync(ordinaryClient, OrdinaryEmail);
        var ordinary = await ordinaryClient.GetFromJsonAsync<AdminPublicAddressResponse>(Endpoint);
        Assert.NotNull(ordinary);
        Assert.Equal("menu.localhost", ordinary.Host);
        Assert.Equal("domain", ordinary.Source);

        using var alternateClient = CreateSecureClient(factory);
        await LoginAsync(alternateClient, AlternateEmail);
        var alternate = await alternateClient.GetFromJsonAsync<AdminPublicAddressResponse>(Endpoint);
        Assert.NotNull(alternate);
        Assert.Equal("alternate.localhost", alternate.Host);
        Assert.Equal("domain", alternate.Source);

        // 3. Neither owner can have been handed the other's host.
        Assert.NotEqual(ordinary.Host, alternate.Host);
    }

    /// <summary>
    /// A tenant with no <c>restaurant_domains</c> row still has an address when the deployment configures
    /// a platform base domain, and it is the same host <see cref="RestaurantResolver"/> would resolve back
    /// to this tenant.
    /// </summary>
    [Fact]
    public async Task TenantWithoutACustomDomainFallsBackToItsSlugBeneathThePlatformBaseDomain()
    {
        using var seedFactory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(seedFactory);
        await CreateOwnerAsync(seedFactory, GuardedSampleDataSeeder.OrdinaryRestaurantId, OrdinaryEmail);
        await RemoveDomainsAsync(seedFactory, GuardedSampleDataSeeder.OrdinaryRestaurantId, clearSlug: false);

        // Subdomain resolution is opt-in per deployment, so the base domain is configured here.
        using var factory = seedFactory.WithWebHostBuilder(builder =>
            builder.UseSetting("PublicMenu:PlatformBaseDomains:0", "example.app"));
        using var client = CreateSecureClient(factory);

        using var anonymousRead = await client.GetAsync(Endpoint);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousRead.StatusCode);
        await LoginAsync(client, OrdinaryEmail);

        // The seeded slug is the leading label of the sample host, so "menu" beneath "example.app".
        var address = await client.GetFromJsonAsync<AdminPublicAddressResponse>(Endpoint);
        Assert.NotNull(address);
        Assert.Equal("menu.example.app", address.Host);
        Assert.Equal("slug", address.Source);
    }

    /// <summary>
    /// With neither a domain row nor a slug, the honest answer is that there is no public address. The
    /// dashboard must be able to say so rather than print a QR code that goes nowhere.
    /// </summary>
    [Fact]
    public async Task TenantWithNeitherACustomDomainNorASlugHasNoPublicAddress()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, OrdinaryEmail);
        await RemoveDomainsAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, clearSlug: true);

        using var client = CreateSecureClient(factory);
        using var anonymousRead = await client.GetAsync(Endpoint);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousRead.StatusCode);
        await LoginAsync(client, OrdinaryEmail);

        var address = await client.GetFromJsonAsync<AdminPublicAddressResponse>(Endpoint);
        Assert.NotNull(address);
        Assert.Null(address.Host);
        Assert.Equal("none", address.Source);
    }

    /// <summary>
    /// Strips a tenant back to the state the fallbacks exist for. The scope is unbound, so the tenant
    /// query filter is not in play and the rows are addressed by restaurant id directly.
    /// </summary>
    private static async Task RemoveDomainsAsync(MenuApiFactory factory, Guid restaurantId, bool clearSlug)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var domains = await dbContext.RestaurantDomains
            .Where(item => item.RestaurantId == restaurantId)
            .ToListAsync();
        dbContext.RestaurantDomains.RemoveRange(domains);

        if (clearSlug)
        {
            var restaurant = await dbContext.Restaurants.SingleAsync(item => item.Id == restaurantId);
            restaurant.Slug = null;
        }

        await dbContext.SaveChangesAsync();
    }
}
