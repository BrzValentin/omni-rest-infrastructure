using System.Net;
using System.Net.Http.Json;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;
using static OmniRest.Api.Tests.Integration.OwnerApiHarness;

namespace OmniRest.Api.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class PriceManagementApiTests(PostgresFixture postgres)
{
    private const string Email = "prices@example.test";

    [Fact]
    public async Task OwnerPriceChangeIsPublishedAndReplacesThePreviousPublicPrice()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);

        using var publicClient = CreateSecureClient(factory);
        publicClient.DefaultRequestHeaders.Host = "menu.localhost";
        var before = await publicClient.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        var publishedDish = before!.Menu!.Categories.SelectMany(item => item.Dishes)
            .Single(item => item.Name == "Prairie Poutine");
        Assert.Equal("12.50", publishedDish.Price);

        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var dish = menu!.Categories.SelectMany(item => item.Dishes).Single(item => item.Name == "Prairie Poutine");

        var updated = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"/api/v1/admin/menu/dishes/{dish.Id}/price",
            new UpdateDishPriceRequest(15m), await GetAntiforgeryAsync(client), menu.ETag));
        Assert.Equal(PublicationStatuses.Succeeded, updated.Publication.Status);
        Assert.Equal("15.00", updated.Menu.Categories.SelectMany(item => item.Dishes)
            .Single(item => item.Id == dish.Id).Price);

        var after = await publicClient.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        var republished = after!.Menu!.Categories.SelectMany(item => item.Dishes).Single(item => item.Id == dish.Id);
        Assert.Equal("15.00", republished.Price);
        Assert.DoesNotContain(after.Menu.Categories.SelectMany(item => item.Dishes), item => item.Price == "12.50");
        Assert.NotEqual(before.PublicationVersion, after.PublicationVersion);
    }

    [Fact]
    public async Task PublicMenuCarriesPriceCurrencyAndTaxDisplayWithoutCalculatingTax()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        using var client = CreateSecureClient(factory);

        client.DefaultRequestHeaders.Host = "menu.localhost";
        var exclusive = await client.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        Assert.Equal("CAD", exclusive!.Currency);
        Assert.Equal("en-CA", exclusive.Locale);
        Assert.Equal("exclusive", exclusive.TaxDisplayMode);
        Assert.Equal("menu.tax.exclusive", exclusive.TaxNoticeKey);
        // Every price is a canonical two-decimal string, and none of them are tax-adjusted.
        var prices = exclusive.Menu!.Categories.SelectMany(item => item.Dishes).Select(item => item.Price).ToArray();
        Assert.NotEmpty(prices);
        Assert.All(prices, price => Assert.Matches(@"^\d+\.\d{2}$", price));
        Assert.Contains("12.50", prices);

        client.DefaultRequestHeaders.Host = "alternate.localhost";
        var inclusive = await client.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        Assert.Equal("inclusive", inclusive!.TaxDisplayMode);
        Assert.Null(inclusive.TaxNoticeKey);
        Assert.Equal("CAD", inclusive.Currency);
    }

    [Fact]
    public async Task PriceUpdatesRejectInvalidAmountsAndForeignDishes()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.AlternateRestaurantId, "alternate@example.test");
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);
        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var dish = menu!.Categories.SelectMany(item => item.Dishes).First();

        foreach (var (json, code) in new[]
        {
            ("{\"price\":-0.01}", "price_negative"),
            ("{\"price\":-100}", "price_negative"),
            ("{\"price\":1.005}", "price_scale_invalid"),
            ("{\"price\":99999999999.99}", "price_too_large")
        })
        {
            using var response = await SendRawAsync(client, HttpMethod.Patch,
                $"/api/v1/admin/menu/dishes/{dish.Id}/price", json, await GetAntiforgeryAsync(client), menu.ETag);
            var payload = await response.Content.ReadAsStringAsync();
            Assert.True(response.StatusCode == HttpStatusCode.BadRequest,
                $"Expected 400 for {json} but received {(int)response.StatusCode}: {payload}");
            Assert.Contains(code, payload, StringComparison.Ordinal);
        }

        // Zero is a valid price; the rejected values above left the dish untouched.
        var free = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"/api/v1/admin/menu/dishes/{dish.Id}/price",
            new UpdateDishPriceRequest(0m), await GetAntiforgeryAsync(client), menu.ETag));
        Assert.Equal("0.00", free.Menu.Categories.SelectMany(item => item.Dishes)
            .Single(item => item.Id == dish.Id).Price);

        using var alternateClient = CreateSecureClient(factory);
        await LoginAsync(alternateClient, "alternate@example.test");
        var alternateMenu = await alternateClient.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var foreignDish = alternateMenu!.Categories.SelectMany(item => item.Dishes).First();

        using var crossTenant = await SendAsync(client, HttpMethod.Patch,
            $"/api/v1/admin/menu/dishes/{foreignDish.Id}/price", new UpdateDishPriceRequest(1m),
            await GetAntiforgeryAsync(client), free.Menu.ETag);
        Assert.Equal(HttpStatusCode.NotFound, crossTenant.StatusCode);

        var alternateAfter = await alternateClient.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        Assert.Equal(foreignDish.Price, alternateAfter!.Categories.SelectMany(item => item.Dishes)
            .Single(item => item.Id == foreignDish.Id).Price);

        using var anonymous = CreateSecureClient(factory);
        using var unauthenticated = await SendAsync(anonymous, HttpMethod.Patch,
            $"/api/v1/admin/menu/dishes/{dish.Id}/price", new UpdateDishPriceRequest(1m), null, null);
        Assert.Equal(HttpStatusCode.Unauthorized, unauthenticated.StatusCode);
    }
}
