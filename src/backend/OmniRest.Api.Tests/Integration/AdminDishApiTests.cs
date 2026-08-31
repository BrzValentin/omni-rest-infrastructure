using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;
using static OmniRest.Api.Tests.Integration.OwnerApiHarness;

namespace OmniRest.Api.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class AdminDishApiTests(PostgresFixture postgres)
{
    private const string Email = "dishes@example.test";

    [Fact]
    public async Task OwnerCanCreateEditMoveReorderAndSoftDeleteDishes()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);

        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        Assert.NotNull(menu);
        Assert.Equal("CAD", menu.Currency);
        Assert.Equal("exclusive", menu.TaxDisplayMode);
        Assert.Equal(9, menu.AvailableBadges.Count);

        var starters = menu.Categories.Single(item => item.Name == "Starters");
        var mains = menu.Categories.Single(item => item.Name == "Mains");
        // The admin menu shows unavailable dishes but hides the archived one.
        Assert.Equal(["Prairie Poutine", "Roasted Tomato Soup"], starters.Dishes.Select(item => item.Name));
        Assert.Equal(AvailabilityStatus.Unavailable, starters.Dishes[1].Availability);
        Assert.DoesNotContain(mains.Dishes, item => item.Name == "Archived Plate");
        Assert.Equal("12.50", starters.Dishes[0].Price);
        Assert.Equal(["contains_nuts", "popular", "vegetarian"], starters.Dishes[0].Badges);
        Assert.NotNull(starters.Dishes[0].Media);

        // Create appends to the end of its category with the requested flags.
        var created = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Post, "/api/v1/admin/menu/dishes",
            new CreateDishRequest(Guid.Parse(starters.Id), "Bannock Basket", 9.25m, "Warm, with honey butter.",
                null, null, ["vegetarian", "new"]),
            await GetAntiforgeryAsync(client), menu.ETag));
        var bannock = created.Menu.Categories.Single(item => item.Id == starters.Id).Dishes
            .Single(item => item.Name == "Bannock Basket");
        Assert.Equal("9.25", bannock.Price);
        Assert.Equal(AvailabilityStatus.Available, bannock.Availability);
        Assert.Equal(2, bannock.DisplayOrder);
        Assert.Equal(["new", "vegetarian"], bannock.Badges);
        Assert.Equal("Warm, with honey butter.", bannock.Description);
        Assert.Equal(3, created.Menu.Categories.Single(item => item.Id == starters.Id).DishCount);

        // Update rewrites the editable fields and can clear the optional ones.
        var updated = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"/api/v1/admin/menu/dishes/{bannock.Id}",
            new UpdateDishRequest(Guid.Parse(starters.Id), "Bannock Basket for Two", 14m, null,
                null, AvailabilityStatus.Unavailable, []),
            await GetAntiforgeryAsync(client), created.Menu.ETag));
        var edited = updated.Menu.Categories.Single(item => item.Id == starters.Id).Dishes
            .Single(item => item.Id == bannock.Id);
        Assert.Equal("Bannock Basket for Two", edited.Name);
        Assert.Equal("14.00", edited.Price);
        Assert.Null(edited.Description);
        Assert.Empty(edited.Badges);
        Assert.Equal(AvailabilityStatus.Unavailable, edited.Availability);
        Assert.True(edited.UpdatedAt > edited.CreatedAt);

        // Moving to another category appends it there and leaves the source contiguous.
        var moved = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"/api/v1/admin/menu/dishes/{bannock.Id}",
            new UpdateDishRequest(Guid.Parse(mains.Id), "Bannock Basket for Two", 14m, null, null, null, null),
            await GetAntiforgeryAsync(client), updated.Menu.ETag));
        Assert.DoesNotContain(moved.Menu.Categories.Single(item => item.Id == starters.Id).Dishes,
            item => item.Id == bannock.Id);
        var inMains = moved.Menu.Categories.Single(item => item.Id == mains.Id);
        Assert.Equal(bannock.Id, inMains.Dishes.Last().Id);

        // Reorder rewrites the whole live order for one category.
        var reversed = inMains.Dishes.Select(item => Guid.Parse(item.Id)).Reverse().ToArray();
        var reordered = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, "/api/v1/admin/menu/dishes/reorder",
            new ReorderDishesRequest(Guid.Parse(mains.Id), reversed),
            await GetAntiforgeryAsync(client), moved.Menu.ETag));
        var reorderedMains = reordered.Menu.Categories.Single(item => item.Id == mains.Id);
        Assert.Equal(reversed, reorderedMains.Dishes.Select(item => Guid.Parse(item.Id)));
        Assert.Equal(Enumerable.Range(0, reversed.Length), reorderedMains.Dishes.Select(item => item.DisplayOrder));

        // Delete is a soft delete: the dish leaves every projection but the row survives.
        var deleted = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync<object>(
            client, HttpMethod.Delete, $"/api/v1/admin/menu/dishes/{bannock.Id}", null,
            await GetAntiforgeryAsync(client), reordered.Menu.ETag));
        Assert.DoesNotContain(deleted.Menu.Categories.SelectMany(item => item.Dishes), item => item.Id == bannock.Id);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var row = await db.Dishes.AsNoTracking().SingleAsync(item => item.Id == Guid.Parse(bannock.Id));
            Assert.NotNull(row.ArchivedAt);
            Assert.False(row.IsActive);
            Assert.Equal("Bannock Basket for Two", row.Name);
        }

        client.DefaultRequestHeaders.Host = "menu.localhost";
        var published = await client.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        Assert.DoesNotContain(published!.Menu!.Categories.SelectMany(item => item.Dishes),
            item => item.Name.StartsWith("Bannock", StringComparison.Ordinal));
    }

    [Fact]
    public async Task DishMutationsAreAuditedWithTheDishIdentity()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);
        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var starters = menu!.Categories.Single(item => item.Name == "Starters");
        var poutine = starters.Dishes.Single(item => item.Name == "Prairie Poutine");

        var priced = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"/api/v1/admin/menu/dishes/{poutine.Id}/price",
            new UpdateDishPriceRequest(13.95m), await GetAntiforgeryAsync(client), menu.ETag));
        Assert.Equal("13.95", priced.Menu.Categories.Single(item => item.Id == starters.Id).Dishes
            .Single(item => item.Id == poutine.Id).Price);

        var hidden = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"/api/v1/admin/menu/dishes/{poutine.Id}/availability",
            new UpdateDishAvailabilityRequest(AvailabilityStatus.Unavailable),
            await GetAntiforgeryAsync(client), priced.Menu.ETag));
        var afterAvailability = hidden.Menu.Categories.Single(item => item.Id == starters.Id).Dishes
            .Single(item => item.Id == poutine.Id);
        Assert.Equal(AvailabilityStatus.Unavailable, afterAvailability.Availability);
        // Availability changes nothing else about the dish.
        Assert.Equal("13.95", afterAvailability.Price);
        Assert.Equal(["contains_nuts", "popular", "vegetarian"], afterAvailability.Badges);
        Assert.NotNull(afterAvailability.Media);
        Assert.Equal(starters.Id, afterAvailability.CategoryId);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var events = await db.AuditEvents.AsNoTracking()
            .Where(item => item.EntityType == "dish")
            .OrderBy(item => item.OccurredAt).ToListAsync();
        Assert.Equal(["menu.dish.price_changed", "menu.dish.availability_changed"], events.Select(item => item.Action));
        Assert.All(events, item =>
        {
            Assert.Equal(Guid.Parse(poutine.Id), item.EntityId);
            Assert.Equal(GuardedSampleDataSeeder.OrdinaryRestaurantId, item.RestaurantId);
            Assert.NotEqual(Guid.Empty, item.ActorUserId);
            Assert.NotNull(item.OperationId);
        });
    }

    [Fact]
    public async Task DishEndpointsRejectInvalidPayloadsForeignResourcesAndUnauthenticatedCallers()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.AlternateRestaurantId, "alternate@example.test");
        using var client = CreateSecureClient(factory);

        using var anonymous = await SendAsync(client, HttpMethod.Post, "/api/v1/admin/menu/dishes",
            new CreateDishRequest(Guid.NewGuid(), "Anonymous", 1m, null, null, null, null), null, null);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        await LoginAsync(client, Email);
        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var categoryId = menu!.Categories[0].Id;
        var dishId = menu.Categories.SelectMany(item => item.Dishes).First().Id;

        var invalid = new[]
        {
            $"{{\"categoryId\":\"{categoryId}\",\"name\":\"\",\"price\":5}}",
            $"{{\"categoryId\":\"{categoryId}\",\"name\":\"   \",\"price\":5}}",
            $"{{\"categoryId\":\"{categoryId}\",\"name\":\"Valid\",\"price\":-1}}",
            $"{{\"categoryId\":\"{categoryId}\",\"name\":\"Valid\",\"price\":5.005}}",
            $"{{\"categoryId\":\"{categoryId}\",\"name\":\"Valid\",\"price\":99999999999}}",
            $"{{\"categoryId\":\"{Guid.Empty}\",\"name\":\"Valid\",\"price\":5}}",
            $"{{\"categoryId\":\"{categoryId}\",\"name\":\"Valid\",\"price\":5,\"badges\":[\"not_a_badge\"]}}",
            $"{{\"categoryId\":\"{categoryId}\",\"name\":\"Valid\",\"price\":5,\"badges\":[\"vegan\",\"vegan\"]}}",
            $"{{\"categoryId\":\"{categoryId}\",\"name\":\"Valid\",\"price\":5,\"availability\":\"sold_out\"}}",
            $"{{\"categoryId\":\"{categoryId}\",\"name\":\"{new string('n', 161)}\",\"price\":5}}"
        };
        foreach (var json in invalid)
        {
            using var response = await SendRawAsync(client, HttpMethod.Post, "/api/v1/admin/menu/dishes", json,
                await GetAntiforgeryAsync(client), menu.ETag);
            var payload = await response.Content.ReadAsStringAsync();
            Assert.True(response.StatusCode == HttpStatusCode.BadRequest,
                $"Expected 400 for {json} but received {(int)response.StatusCode}: {payload}");
            Assert.Contains("admin_validation", payload, StringComparison.Ordinal);
        }

        // Free dishes are allowed; the price floor is zero, not one cent.
        var free = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Post, "/api/v1/admin/menu/dishes",
            new CreateDishRequest(Guid.Parse(categoryId), "Tap Water", 0m, null, null, null, null),
            await GetAntiforgeryAsync(client), menu.ETag));
        Assert.Equal("0.00", free.Menu.Categories.Single(item => item.Id == categoryId).Dishes
            .Single(item => item.Name == "Tap Water").Price);

        // A foreign category, dish, or media asset is indistinguishable from a missing one.
        using var alternateClient = CreateSecureClient(factory);
        await LoginAsync(alternateClient, "alternate@example.test");
        var alternateMenu = await alternateClient.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var foreignCategory = Guid.Parse(alternateMenu!.Categories[0].Id);
        var foreignDish = alternateMenu.Categories.SelectMany(item => item.Dishes).First().Id;

        using var foreignCategoryCreate = await SendAsync(client, HttpMethod.Post, "/api/v1/admin/menu/dishes",
            new CreateDishRequest(foreignCategory, "Stolen", 5m, null, null, null, null),
            await GetAntiforgeryAsync(client), free.Menu.ETag);
        Assert.Equal(HttpStatusCode.NotFound, foreignCategoryCreate.StatusCode);
        Assert.Contains("menu_category_not_found", await foreignCategoryCreate.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var foreignDishDelete = await SendAsync<object>(client, HttpMethod.Delete,
            $"/api/v1/admin/menu/dishes/{foreignDish}", null, await GetAntiforgeryAsync(client), free.Menu.ETag);
        Assert.Equal(HttpStatusCode.NotFound, foreignDishDelete.StatusCode);
        Assert.Contains("dish_not_found", await foreignDishDelete.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var foreignMedia = await SendAsync(client, HttpMethod.Post, "/api/v1/admin/menu/dishes",
            new CreateDishRequest(Guid.Parse(categoryId), "Stolen image", 5m, null, Guid.NewGuid(), null, null),
            await GetAntiforgeryAsync(client), free.Menu.ETag);
        Assert.Equal(HttpStatusCode.NotFound, foreignMedia.StatusCode);
        Assert.Contains("media_asset_not_found", await foreignMedia.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var badCsrf = await SendAsync(client, HttpMethod.Patch, $"/api/v1/admin/menu/dishes/{dishId}/price",
            new UpdateDishPriceRequest(5m), "invalid-token", free.Menu.ETag);
        Assert.Equal(HttpStatusCode.BadRequest, badCsrf.StatusCode);
        Assert.Contains("csrf_invalid", await badCsrf.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var staleEtag = await SendAsync(client, HttpMethod.Patch, $"/api/v1/admin/menu/dishes/{dishId}/price",
            new UpdateDishPriceRequest(5m), await GetAntiforgeryAsync(client), menu.ETag);
        Assert.Equal(HttpStatusCode.Conflict, staleEtag.StatusCode);
        Assert.Contains("concurrency_conflict", await staleEtag.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // The alternate restaurant is untouched by every rejected attempt.
        var alternateAfter = await alternateClient.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        Assert.Equal(
            alternateMenu.Categories.SelectMany(item => item.Dishes).Select(item => item.Name),
            alternateAfter!.Categories.SelectMany(item => item.Dishes).Select(item => item.Name));
    }

    [Fact]
    public async Task DeletingACategoryIsAllowedOnceItsDishesAreDeleted()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);
        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var starters = menu!.Categories.Single(item => item.Name == "Starters");

        var etag = menu.ETag;
        foreach (var dish in starters.Dishes)
        {
            var response = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync<object>(
                client, HttpMethod.Delete, $"/api/v1/admin/menu/dishes/{dish.Id}", null,
                await GetAntiforgeryAsync(client), etag));
            etag = response.Menu.ETag;
        }

        var cleared = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync<object>(
            client, HttpMethod.Delete, $"/api/v1/admin/menu/categories/{starters.Id}", null,
            await GetAntiforgeryAsync(client), etag));
        Assert.DoesNotContain(cleared.Menu.Categories, item => item.Id == starters.Id);
    }
}
