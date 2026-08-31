using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;
using static OmniRest.Api.Tests.Integration.OwnerApiHarness;

namespace OmniRest.Api.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class DishAvailabilityApiTests(PostgresFixture postgres)
{
    private const string Email = "availability@example.test";

    [Fact]
    public async Task NewDishesDefaultToAvailableAndTheDatabaseRefusesOtherStatuses()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);
        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var categoryId = Guid.Parse(menu!.Categories[0].Id);

        var created = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Post, "/api/v1/admin/menu/dishes",
            new CreateDishRequest(categoryId, "Seasonal Special", 11m, null, null, null, null),
            await GetAntiforgeryAsync(client), menu.ETag));
        var dish = created.Menu.Categories.SelectMany(item => item.Dishes)
            .Single(item => item.Name == "Seasonal Special");
        Assert.Equal(AvailabilityStatus.Available, dish.Availability);

        // Every seeded dish also carries a valid status.
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var statuses = await db.Dishes.AsNoTracking().Select(item => item.Availability).Distinct().ToListAsync();
        Assert.All(statuses, status => Assert.True(AvailabilityStatus.IsValid(status)));

        var rejected = await Assert.ThrowsAsync<Npgsql.PostgresException>(() =>
            db.Database.ExecuteSqlRawAsync(
                "UPDATE public.dishes SET availability_status = 'sold_out' WHERE id = {0};", Guid.Parse(dish.Id)));
        Assert.Equal("ck_dishes_availability", rejected.ConstraintName);
    }

    [Fact]
    public async Task OwnerCanHideAndRestoreADishAcrossDraftPreviewAndPublishedMenus()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);
        using var publicClient = CreateSecureClient(factory);
        publicClient.DefaultRequestHeaders.Host = "menu.localhost";

        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var dish = menu!.Categories.SelectMany(item => item.Dishes).Single(item => item.Name == "Prairie Poutine");
        Assert.Equal(AvailabilityStatus.Available, dish.Availability);

        var hidden = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"/api/v1/admin/menu/dishes/{dish.Id}/availability",
            new UpdateDishAvailabilityRequest(AvailabilityStatus.Unavailable),
            await GetAntiforgeryAsync(client), menu.ETag));
        Assert.Equal(PublicationStatuses.Succeeded, hidden.Publication.Status);

        // The admin menu keeps showing the dish, with its new status.
        var adminAfter = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        Assert.Equal(AvailabilityStatus.Unavailable, adminAfter!.Categories.SelectMany(item => item.Dishes)
            .Single(item => item.Id == dish.Id).Availability);

        // The owner preview renders the draft, so the change is visible there immediately.
        var preview = await client.GetFromJsonAsync<PublicMenuResponse>(
            $"/api/v1/admin/website-designs/{WebsiteDesignIds.LegacyCurrent}/preview");
        Assert.Equal(AvailabilityStatus.Unavailable, preview!.Menu!.Categories.SelectMany(item => item.Dishes)
            .Single(item => item.Id == dish.Id).Availability);

        // Visitors keep seeing the dish, marked unavailable, per the Phase 2 visitor experience.
        var published = await publicClient.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        var publishedDish = published!.Menu!.Categories.SelectMany(item => item.Dishes)
            .Single(item => item.Id == dish.Id);
        Assert.Equal(AvailabilityStatus.Unavailable, publishedDish.Availability);
        Assert.Equal("Prairie Poutine", publishedDish.Name);
        Assert.Equal("12.50", publishedDish.Price);

        // Restoring the dish puts it back to available everywhere.
        var restored = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"/api/v1/admin/menu/dishes/{dish.Id}/availability",
            new UpdateDishAvailabilityRequest(AvailabilityStatus.Available),
            await GetAntiforgeryAsync(client), adminAfter.ETag));
        Assert.Equal(AvailabilityStatus.Available, restored.Menu.Categories.SelectMany(item => item.Dishes)
            .Single(item => item.Id == dish.Id).Availability);

        var republished = await publicClient.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        Assert.Equal(AvailabilityStatus.Available, republished!.Menu!.Categories.SelectMany(item => item.Dishes)
            .Single(item => item.Id == dish.Id).Availability);
    }

    [Fact]
    public async Task AvailabilityNeverChangesTheRestOfTheDishAndCategoriesKeepWorking()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);
        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var before = menu!.Categories.SelectMany(item => item.Dishes).Single(item => item.Name == "Prairie Poutine");

        var hidden = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"/api/v1/admin/menu/dishes/{before.Id}/availability",
            new UpdateDishAvailabilityRequest(AvailabilityStatus.Unavailable),
            await GetAntiforgeryAsync(client), menu.ETag));
        var after = hidden.Menu.Categories.SelectMany(item => item.Dishes).Single(item => item.Id == before.Id);

        Assert.Equal(before.Name, after.Name);
        Assert.Equal(before.Description, after.Description);
        Assert.Equal(before.Price, after.Price);
        Assert.Equal(before.CategoryId, after.CategoryId);
        Assert.Equal(before.MediaAssetId, after.MediaAssetId);
        Assert.Equal(before.Badges, after.Badges);
        Assert.Equal(before.DisplayOrder, after.DisplayOrder);
        Assert.Equal(before.CreatedAt, after.CreatedAt);

        // Categories still list the same dishes, and the counts are unchanged.
        Assert.Equal(
            menu.Categories.Select(item => (item.Id, item.DishCount)),
            hidden.Menu.Categories.Select(item => (item.Id, item.DishCount)));
    }

    [Fact]
    public async Task AvailabilityUpdatesRejectUnsupportedStatusesAndForeignDishes()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.AlternateRestaurantId, "alternate@example.test");
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);
        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var dishId = menu!.Categories.SelectMany(item => item.Dishes).First().Id;

        foreach (var json in new[] { "{\"status\":\"sold_out\"}", "{\"status\":\"\"}", "{\"status\":null}", "{}" })
        {
            using var response = await SendRawAsync(client, HttpMethod.Patch,
                $"/api/v1/admin/menu/dishes/{dishId}/availability", json, await GetAntiforgeryAsync(client), menu.ETag);
            var payload = await response.Content.ReadAsStringAsync();
            Assert.True(response.StatusCode == HttpStatusCode.BadRequest,
                $"Expected 400 for {json} but received {(int)response.StatusCode}: {payload}");
            Assert.Contains("admin_validation", payload, StringComparison.Ordinal);
        }

        using var alternateClient = CreateSecureClient(factory);
        await LoginAsync(alternateClient, "alternate@example.test");
        var alternateMenu = await alternateClient.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var foreignDish = alternateMenu!.Categories.SelectMany(item => item.Dishes).First();

        using var crossTenant = await SendAsync(client, HttpMethod.Patch,
            $"/api/v1/admin/menu/dishes/{foreignDish.Id}/availability",
            new UpdateDishAvailabilityRequest(AvailabilityStatus.Unavailable),
            await GetAntiforgeryAsync(client), menu.ETag);
        Assert.Equal(HttpStatusCode.NotFound, crossTenant.StatusCode);

        var alternateAfter = await alternateClient.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        Assert.Equal(foreignDish.Availability, alternateAfter!.Categories.SelectMany(item => item.Dishes)
            .Single(item => item.Id == foreignDish.Id).Availability);
    }

    [Fact]
    public async Task DeletedDishesLeaveThePublicMenuWhileUnavailableOnesRemainListed()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);
        using var publicClient = CreateSecureClient(factory);
        publicClient.DefaultRequestHeaders.Host = "menu.localhost";

        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var soup = menu!.Categories.SelectMany(item => item.Dishes).Single(item => item.Name == "Roasted Tomato Soup");
        Assert.Equal(AvailabilityStatus.Unavailable, soup.Availability);

        var published = await publicClient.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        Assert.Contains(published!.Menu!.Categories.SelectMany(item => item.Dishes), item => item.Id == soup.Id);

        var deleted = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync<object>(
            client, HttpMethod.Delete, $"/api/v1/admin/menu/dishes/{soup.Id}", null,
            await GetAntiforgeryAsync(client), menu.ETag));
        Assert.DoesNotContain(deleted.Menu.Categories.SelectMany(item => item.Dishes), item => item.Id == soup.Id);

        var afterDelete = await publicClient.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        Assert.DoesNotContain(afterDelete!.Menu!.Categories.SelectMany(item => item.Dishes), item => item.Id == soup.Id);
        // The rest of the category is untouched.
        Assert.Contains(afterDelete.Menu.Categories.SelectMany(item => item.Dishes), item => item.Name == "Prairie Poutine");
    }
}
