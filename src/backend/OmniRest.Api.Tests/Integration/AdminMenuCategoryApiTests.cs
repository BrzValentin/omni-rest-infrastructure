using System.Net;
using System.Net.Http.Json;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Data;
using OmniRest.Api.Menus;
using static OmniRest.Api.Tests.Integration.OwnerApiHarness;

namespace OmniRest.Api.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class AdminMenuCategoryApiTests(PostgresFixture postgres)
{
    private const string Email = "categories@example.test";

    [Fact]
    public async Task OwnerCanCreateRenameReorderAndDeleteCategoriesAndSeeThemPublished()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);

        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        Assert.NotNull(menu);
        Assert.Equal("All Day Menu", menu.MenuName);
        Assert.Equal(["Starters", "Mains", "Desserts", "Hidden"], menu.Categories.Select(item => item.Name));
        Assert.Equal([0, 1, 2, 3], menu.Categories.Select(item => item.DisplayOrder));
        Assert.Equal(2, menu.Categories.Single(item => item.Name == "Starters").DishCount);
        Assert.Equal(0, menu.Categories.Single(item => item.Name == "Desserts").DishCount);
        Assert.False(menu.Categories.Single(item => item.Name == "Hidden").IsActive);

        // Create appends to the end of the menu and derives a slug.
        var created = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Post, "/api/v1/admin/menu/categories",
            new CreateMenuCategoryRequest("Sunday Brunch", "Weekend only."),
            await GetAntiforgeryAsync(client), menu.ETag));
        var brunch = created.Menu.Categories.Single(item => item.Name == "Sunday Brunch");
        Assert.Equal(4, brunch.DisplayOrder);
        Assert.Equal("sunday-brunch", brunch.Slug);
        Assert.Equal("Weekend only.", brunch.Description);
        Assert.Equal(0, brunch.DishCount);
        Assert.True(brunch.IsActive);
        Assert.NotEqual(menu.ETag, created.Menu.ETag);

        // Rename changes the name only; the published slug stays stable.
        var renamed = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, $"/api/v1/admin/menu/categories/{brunch.Id}",
            new UpdateMenuCategoryRequest("Weekend Brunch", null),
            await GetAntiforgeryAsync(client), created.Menu.ETag));
        var renamedBrunch = renamed.Menu.Categories.Single(item => item.Id == brunch.Id);
        Assert.Equal("Weekend Brunch", renamedBrunch.Name);
        Assert.Equal("sunday-brunch", renamedBrunch.Slug);
        Assert.Null(renamedBrunch.Description);
        Assert.Equal(4, renamedBrunch.DisplayOrder);
        Assert.True(renamedBrunch.UpdatedAt > renamedBrunch.CreatedAt);

        // Reorder rewrites every display order inside one transaction.
        var reversed = renamed.Menu.Categories.Select(item => Guid.Parse(item.Id)).Reverse().ToArray();
        var reordered = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync(
            client, HttpMethod.Patch, "/api/v1/admin/menu/categories/reorder",
            new ReorderMenuCategoriesRequest(reversed),
            await GetAntiforgeryAsync(client), renamed.Menu.ETag));
        Assert.Equal(reversed, reordered.Menu.Categories.Select(item => Guid.Parse(item.Id)));
        Assert.Equal([0, 1, 2, 3, 4], reordered.Menu.Categories.Select(item => item.DisplayOrder));

        // The new order survives a fresh read.
        var reloaded = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        Assert.Equal(reversed, reloaded!.Categories.Select(item => Guid.Parse(item.Id)));

        // A category that still holds dishes cannot be deleted.
        var starters = reloaded.Categories.Single(item => item.Name == "Starters");
        using var blocked = await SendAsync<object>(
            client, HttpMethod.Delete, $"/api/v1/admin/menu/categories/{starters.Id}", null,
            await GetAntiforgeryAsync(client), reloaded.ETag);
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Contains("category_contains_dishes", await blocked.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // An empty category is deleted and disappears from the draft.
        var deleted = await ExpectOkAsync<AdminMenuMutationResponse>(await SendAsync<object>(
            client, HttpMethod.Delete, $"/api/v1/admin/menu/categories/{brunch.Id}", null,
            await GetAntiforgeryAsync(client), reloaded.ETag));
        Assert.DoesNotContain(deleted.Menu.Categories, item => item.Id == brunch.Id);
        Assert.Equal(4, deleted.Menu.Categories.Count);
        Assert.Equal(["Hidden", "Desserts", "Mains", "Starters"], deleted.Menu.Categories.Select(item => item.Name));
        Assert.Equal([1, 2, 3, 4], deleted.Menu.Categories.Select(item => item.DisplayOrder));

        // Every mutation published, so visitors see the new order and names.
        Assert.Equal(PublicationStatuses.Succeeded, deleted.Publication.Status);
        client.DefaultRequestHeaders.Host = "menu.localhost";
        var published = await client.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        Assert.Equal(["Desserts", "Mains", "Starters"], published!.Menu!.Categories.Select(item => item.Name));
    }

    [Fact]
    public async Task CategoryEndpointsEnforceAuthenticationCsrfConcurrencyAndTenantIsolation()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.AlternateRestaurantId, "alternate@example.test");
        using var client = CreateSecureClient(factory);

        using var anonymousRead = await client.GetAsync("/api/v1/admin/menu");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousRead.StatusCode);
        using var anonymousWrite = await SendAsync(client, HttpMethod.Post, "/api/v1/admin/menu/categories",
            new CreateMenuCategoryRequest("Anonymous", null), null, null);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousWrite.StatusCode);

        await LoginAsync(client, Email);
        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        Assert.NotNull(menu);

        using var badCsrf = await SendAsync(client, HttpMethod.Post, "/api/v1/admin/menu/categories",
            new CreateMenuCategoryRequest("Bad token", null), "invalid-token", menu.ETag);
        Assert.Equal(HttpStatusCode.BadRequest, badCsrf.StatusCode);
        Assert.Contains("csrf_invalid", await badCsrf.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var staleEtag = await SendAsync(client, HttpMethod.Post, "/api/v1/admin/menu/categories",
            new CreateMenuCategoryRequest("Stale", null), await GetAntiforgeryAsync(client),
            "\"draft-00000000000000000000000000000000-1\"");
        Assert.Equal(HttpStatusCode.Conflict, staleEtag.StatusCode);
        Assert.Contains("concurrency_conflict", await staleEtag.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        // A category id belonging to another restaurant is indistinguishable from a missing one.
        using var alternateClient = CreateSecureClient(factory);
        await LoginAsync(alternateClient, "alternate@example.test");
        var alternateMenu = await alternateClient.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        var foreignCategoryId = alternateMenu!.Categories[0].Id;
        Assert.DoesNotContain(menu.Categories, item => item.Id == foreignCategoryId);

        using var crossTenantRename = await SendAsync(client, HttpMethod.Patch,
            $"/api/v1/admin/menu/categories/{foreignCategoryId}", new UpdateMenuCategoryRequest("Stolen", null),
            await GetAntiforgeryAsync(client), menu.ETag);
        Assert.Equal(HttpStatusCode.NotFound, crossTenantRename.StatusCode);
        Assert.Contains("menu_category_not_found", await crossTenantRename.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var crossTenantDelete = await SendAsync<object>(client, HttpMethod.Delete,
            $"/api/v1/admin/menu/categories/{foreignCategoryId}", null, await GetAntiforgeryAsync(client), menu.ETag);
        Assert.Equal(HttpStatusCode.NotFound, crossTenantDelete.StatusCode);

        // The other restaurant's category is untouched.
        var alternateAfter = await alternateClient.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        Assert.Equal(alternateMenu.Categories[0].Name, alternateAfter!.Categories[0].Name);
    }

    [Fact]
    public async Task CategoryValidationRejectsInvalidNamesAndPartialReorders()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = CreateSecureClient(factory);
        await LoginAsync(client, Email);
        var menu = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        Assert.NotNull(menu);

        var invalid = new[]
        {
            (HttpMethod.Post, "/api/v1/admin/menu/categories", "{\"name\":\"\"}"),
            (HttpMethod.Post, "/api/v1/admin/menu/categories", "{\"name\":\"   \"}"),
            (HttpMethod.Post, "/api/v1/admin/menu/categories", "{\"name\":null}"),
            (HttpMethod.Post, "/api/v1/admin/menu/categories", $"{{\"name\":\"{new string('x', 101)}\"}}"),
            (HttpMethod.Post, "/api/v1/admin/menu/categories", $"{{\"name\":\"Fine\",\"description\":\"{new string('y', 301)}\"}}"),
            (HttpMethod.Patch, $"/api/v1/admin/menu/categories/{menu.Categories[0].Id}", "{\"name\":\"  \"}"),
            (HttpMethod.Patch, "/api/v1/admin/menu/categories/reorder", "{\"categoryIds\":[]}"),
            (HttpMethod.Patch, "/api/v1/admin/menu/categories/reorder", "{\"categoryIds\":null}")
        };
        foreach (var (method, uri, json) in invalid)
        {
            using var response = await SendRawAsync(client, method, uri, json, await GetAntiforgeryAsync(client), menu.ETag);
            var payload = await response.Content.ReadAsStringAsync();
            Assert.True(response.StatusCode == HttpStatusCode.BadRequest,
                $"Expected 400 for {method} {uri} but received {(int)response.StatusCode}: {payload}");
            Assert.Contains("admin_validation", payload, StringComparison.Ordinal);
        }

        // A reorder must name every category; partial payloads are refused without changing anything.
        var duplicated = new[] { Guid.Parse(menu.Categories[0].Id), Guid.Parse(menu.Categories[0].Id) };
        using var duplicateResponse = await SendAsync(client, HttpMethod.Patch, "/api/v1/admin/menu/categories/reorder",
            new ReorderMenuCategoriesRequest(duplicated), await GetAntiforgeryAsync(client), menu.ETag);
        Assert.Equal(HttpStatusCode.BadRequest, duplicateResponse.StatusCode);
        Assert.Contains("category_reorder_duplicate", await duplicateResponse.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var partial = menu.Categories.Take(2).Select(item => Guid.Parse(item.Id)).ToArray();
        using var partialResponse = await SendAsync(client, HttpMethod.Patch, "/api/v1/admin/menu/categories/reorder",
            new ReorderMenuCategoriesRequest(partial), await GetAntiforgeryAsync(client), menu.ETag);
        Assert.Equal(HttpStatusCode.BadRequest, partialResponse.StatusCode);
        Assert.Contains("category_reorder_incomplete", await partialResponse.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        var unchanged = await client.GetFromJsonAsync<AdminMenuResponse>("/api/v1/admin/menu");
        Assert.Equal(menu.Categories.Select(item => item.Id), unchanged!.Categories.Select(item => item.Id));
        Assert.Equal(menu.ETag, unchanged.ETag);
    }
}
