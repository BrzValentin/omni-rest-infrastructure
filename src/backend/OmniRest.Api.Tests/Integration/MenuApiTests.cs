using System.Diagnostics;
using System.Data.Common;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Npgsql;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;

namespace OmniRest.Api.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class MenuApiTests(PostgresFixture postgres)
{
    [Fact]
    public async Task PublicMenuHonorsContractOrderingVisibilityAndConditionalGet()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Host = "menu.localhost:443";

        using var response = await client.GetAsync("/api/v1/public/menu");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.Public);
        Assert.True(response.Headers.CacheControl?.MustRevalidate);
        Assert.Equal(TimeSpan.Zero, response.Headers.CacheControl?.MaxAge);
        Assert.NotNull(response.Headers.ETag);
        Assert.False(response.Headers.ETag.IsWeak);
        var body = await response.Content.ReadFromJsonAsync<PublicMenuResponse>();
        Assert.NotNull(body);
        Assert.Equal("Prairie Table", body.RestaurantName);
        Assert.Equal("en-CA", body.Locale);
        Assert.Equal("CAD", body.Currency);
        Assert.Equal("exclusive", body.TaxDisplayMode);
        Assert.Equal("1", body.PublicationVersion);
        Assert.NotNull(body.Menu);
        Assert.Equal(["starters", "mains", "desserts"], body.Menu.Categories.Select(item => item.Slug));
        Assert.Empty(body.Menu.Categories[2].Dishes);
        Assert.Contains(body.Menu.Categories.SelectMany(item => item.Dishes), item => item.Availability == "unavailable");
        Assert.DoesNotContain(body.Menu.Categories.SelectMany(item => item.Dishes), item => item.Name.Contains("Archived", StringComparison.Ordinal));
        Assert.DoesNotContain(body.Menu.Categories.SelectMany(item => item.Dishes), item => item.Name.Contains("Inactive", StringComparison.Ordinal));
        Assert.All(body.Menu.Categories.SelectMany(item => item.Dishes), item => Assert.Matches("^[0-9]+\\.[0-9]{2}$", item.Price));

        using var conditional = new HttpRequestMessage(HttpMethod.Get, "/api/v1/public/menu");
        conditional.Headers.Host = "menu.localhost";
        conditional.Headers.IfNoneMatch.Add(response.Headers.ETag);
        using var notModified = await client.SendAsync(conditional);
        Assert.Equal(HttpStatusCode.NotModified, notModified.StatusCode);
        Assert.Equal(0, notModified.Content.Headers.ContentLength ?? 0);
    }

    [Fact]
    public async Task EverySeededMediaVariantResolvesFromConfiguredPublicPath()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        using var client = factory.CreateClient();

        var publicMenu = await ReadForHostAsync(client, "menu.localhost");
        var publishedVariantUrls = publicMenu.Menu!.Categories
            .SelectMany(category => category.Dishes)
            .SelectMany(dish => dish.Media?.Variants ?? [])
            .Select(variant => variant.Url)
            .ToArray();
        Assert.NotEmpty(publishedVariantUrls);

        IReadOnlyList<string> variantUrls;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            variantUrls = await dbContext.MediaVariants.AsNoTracking()
                .OrderBy(item => item.Url)
                .Select(item => item.Url)
                .ToArrayAsync();
        }

        Assert.NotEmpty(variantUrls);
        Assert.All(publishedVariantUrls, url => Assert.Contains(url, variantUrls));
        Assert.All(variantUrls, url => Assert.StartsWith("/media/uploads/seed/", url, StringComparison.Ordinal));
        foreach (var url in variantUrls)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Host = "menu.localhost";
            using var response = await client.SendAsync(request);

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("image/webp", response.Content.Headers.ContentType?.MediaType);
        }
    }

    [Fact]
    public async Task HostResolutionIsTenantSafeAndUnknownHostUsesProblemDetails()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        using var client = factory.CreateClient();

        using var alternate = await SendForHostAsync(client, "alternate.localhost");
        var alternateBody = await alternate.Content.ReadFromJsonAsync<PublicMenuResponse>();
        Assert.Equal(HttpStatusCode.OK, alternate.StatusCode);
        Assert.NotNull(alternateBody);
        Assert.Equal("Café Boréal", alternateBody.RestaurantName);
        Assert.Equal("3", alternateBody.PublicationVersion);
        Assert.DoesNotContain("Prairie", await alternate.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        using var unknown = await SendForHostAsync(client, "unknown.localhost");
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("application/problem+json", unknown.Content.Headers.ContentType?.MediaType);
        var problem = await unknown.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(404, problem.GetProperty("status").GetInt32());
        Assert.False(problem.TryGetProperty("stackTrace", out _));
    }

    [Fact]
    public async Task EmptyStatesDistinguishNoPublicationNoCategoriesAndActiveEmptyCategory()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        using var client = factory.CreateClient();

        var noMenu = await ReadForHostAsync(client, "no-menu.localhost");
        Assert.Equal("0", noMenu.PublicationVersion);
        Assert.Null(noMenu.Menu);

        var noActive = await ReadForHostAsync(client, "no-active.localhost");
        Assert.NotNull(noActive.Menu);
        Assert.Empty(noActive.Menu.Categories);

        var activeEmpty = await ReadForHostAsync(client, "active-empty.localhost");
        Assert.Single(activeEmpty.Menu!.Categories);
        Assert.Empty(activeEmpty.Menu.Categories[0].Dishes);
    }

    [Fact]
    public async Task OldValidatorReceivesNewAvailabilityVersionAndCacheDoesNotRetainOldSnapshot()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        using var client = factory.CreateClient();

        using var initial = await SendForHostAsync(client, "menu.localhost");
        var oldTag = initial.Headers.ETag!;
        var oldBody = await initial.Content.ReadFromJsonAsync<PublicMenuResponse>();
        Assert.NotNull(oldBody);

        var changedDish = oldBody.Menu!.Categories.SelectMany(item => item.Dishes).First();
        var newCategories = oldBody.Menu.Categories.Select(category =>
            category with
            {
                Dishes = category.Dishes.Select(dish => dish.Id == changedDish.Id
                    ? dish with { Availability = AvailabilityStatus.Unavailable }
                    : dish).ToArray()
            }).ToArray();
        var versionTwo = oldBody with
        {
            PublicationVersion = "2",
            Menu = oldBody.Menu with { Categories = newCategories }
        };

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var serializer = scope.ServiceProvider.GetRequiredService<PublicMenuSnapshotSerializer>();
            await db.Publications.Where(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId)
                .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.IsCurrent, false));
            db.Publications.Add(new PublicationEntity
            {
                Id = Guid.Parse("22222222-aaaa-bbbb-cccc-222222222222"),
                RestaurantId = GuardedSampleDataSeeder.OrdinaryRestaurantId,
                Version = 2,
                SnapshotJson = serializer.Serialize(versionTwo),
                IsCurrent = true,
                PublishedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/public/menu");
        request.Headers.Host = "menu.localhost";
        request.Headers.IfNoneMatch.Add(oldTag);
        using var refreshed = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        Assert.NotEqual(oldTag.Tag, refreshed.Headers.ETag?.Tag);
        var refreshedBody = await refreshed.Content.ReadFromJsonAsync<PublicMenuResponse>();
        Assert.Equal("2", refreshedBody?.PublicationVersion);
        Assert.Equal(AvailabilityStatus.Unavailable,
            refreshedBody?.Menu?.Categories.SelectMany(item => item.Dishes).Single(item => item.Id == changedDish.Id).Availability);
    }

    [Fact]
    public async Task OpenApiDocumentsPublicAndPhaseThreeContractsWithoutPersistenceFields()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/openapi/v1.json");
        var document = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("/api/v1/public/menu", document, StringComparison.Ordinal);
        Assert.Contains("PublicMenuResponse", document, StringComparison.Ordinal);
        Assert.Contains("publicationVersion", document, StringComparison.Ordinal);
        Assert.Contains("/api/v1/public/restaurant", document, StringComparison.Ordinal);
        Assert.Contains("/api/v1/auth/login", document, StringComparison.Ordinal);
        Assert.Contains("/api/v1/admin/restaurant/profile", document, StringComparison.Ordinal);
        Assert.DoesNotContain("concurrencyVersion", document, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("archivedAt", document, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("patch", document, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task SampleSeedIsIdempotentAndContainsOnlyGuardedScenarios()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await using var scope = factory.Services.CreateAsyncScope();
        var environment = scope.ServiceProvider.GetRequiredService<IHostEnvironment>();
        await GuardedSampleDataSeeder.SeedAsync(factory.Services, environment, large: false);

        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(5, await db.Restaurants.CountAsync());
        Assert.Equal(5, await db.RestaurantDomains.CountAsync());
        Assert.Equal(36, await db.Badges.CountAsync());
        Assert.Equal(4, await db.Publications.CountAsync());
        Assert.Equal(1, await db.Restaurants.CountAsync(item => item.Id == GuardedSampleDataSeeder.OrdinaryRestaurantId));
    }

    [Fact]
    public async Task PublicReadUsesExactlyTwoDatabaseQueries()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        var counter = new QueryCountingInterceptor();
        var options = new DbContextOptionsBuilder<MenuDbContext>()
            .UseNpgsql(postgres.ConnectionString)
            .AddInterceptors(counter)
            .Options;
        await using var context = new MenuDbContext(options);
        await using var scope = factory.Services.CreateAsyncScope();
        var environment = scope.ServiceProvider.GetRequiredService<IHostEnvironment>();
        var resolver = new RestaurantResolver(context, environment, Options.Create(new PublicMenuOptions()));
        using var memoryCache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 64 });
        var reader = new PublicMenuReader(resolver, context, memoryCache, new PublicMenuSnapshotSerializer());

        var result = await reader.ReadAsync(new HostString("menu.localhost"), CancellationToken.None);

        Assert.NotNull(result);
        Assert.Equal(2, counter.ReaderQueryCount);
    }

    [Fact]
    public async Task PostgreSqlConstraintsAndAvailabilityDefaultProtectTenantData()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);

        await using var connection = new NpgsqlConnection(postgres.ConnectionString);
        await connection.OpenAsync();
        await using var crossTenant = new NpgsqlCommand(
            """
            INSERT INTO public.dishes
            (id, restaurant_id, menu_id, category_id, name, price, is_active, display_order, created_at, updated_at)
            SELECT gen_random_uuid(), @alternate, menu_id, id, 'Cross tenant', 1.00, true, 50, now(), now()
            FROM public.menu_categories WHERE restaurant_id = @ordinary LIMIT 1;
            """, connection);
        crossTenant.Parameters.AddWithValue("alternate", GuardedSampleDataSeeder.AlternateRestaurantId);
        crossTenant.Parameters.AddWithValue("ordinary", GuardedSampleDataSeeder.OrdinaryRestaurantId);
        await Assert.ThrowsAsync<PostgresException>(() => crossTenant.ExecuteNonQueryAsync());

        await using var defaultAvailability = new NpgsqlCommand(
            """
            INSERT INTO public.dishes
            (id, restaurant_id, menu_id, category_id, name, price, is_active, display_order, created_at, updated_at)
            SELECT gen_random_uuid(), restaurant_id, menu_id, id, 'Default availability', 1.00, true, 51, now(), now()
            FROM public.menu_categories WHERE restaurant_id = @ordinary AND is_active LIMIT 1
            RETURNING availability_status;
            """, connection);
        defaultAvailability.Parameters.AddWithValue("ordinary", GuardedSampleDataSeeder.OrdinaryRestaurantId);
        Assert.Equal("available", await defaultAvailability.ExecuteScalarAsync());

        await using var invalidAvailability = new NpgsqlCommand(
            "UPDATE public.dishes SET availability_status = 'sometimes' WHERE restaurant_id = @ordinary;", connection);
        invalidAvailability.Parameters.AddWithValue("ordinary", GuardedSampleDataSeeder.OrdinaryRestaurantId);
        await Assert.ThrowsAsync<PostgresException>(() => invalidAvailability.ExecuteNonQueryAsync());
    }

    [Fact]
    public async Task LargeFixtureHasThirtyCategoriesOneThousandDishesAndRecordsLocalMetrics()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory, large: true);
        using var client = factory.CreateClient();
        var durations = new List<double>();
        var payloadBytes = 0;
        PublicMenuResponse? body = null;

        for (var iteration = 0; iteration < 10; iteration++)
        {
            var watch = Stopwatch.StartNew();
            using var response = await SendForHostAsync(client, "large-menu.localhost");
            var bytes = await response.Content.ReadAsByteArrayAsync();
            watch.Stop();
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            payloadBytes = bytes.Length;
            durations.Add(watch.Elapsed.TotalMilliseconds);
            body = JsonSerializer.Deserialize<PublicMenuResponse>(bytes, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        }

        Assert.NotNull(body?.Menu);
        Assert.Equal(30, body.Menu.Categories.Count);
        Assert.Equal(1000, body.Menu.Categories.Sum(category => category.Dishes.Count));
        durations.Sort();
        var p95 = durations[(int)Math.Ceiling(durations.Count * 0.95) - 1];
        Assert.True(payloadBytes > 0);
        Console.WriteLine(
            "Local PostgreSQL 18 large fixture: payload={0} bytes, warm/request sample p95={1:F2} ms, samples={2}.",
            payloadBytes, p95, durations.Count);
    }

    private static async Task<HttpResponseMessage> SendForHostAsync(HttpClient client, string host)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/public/menu");
        request.Headers.Host = host;
        return await client.SendAsync(request);
    }

    private static async Task<PublicMenuResponse> ReadForHostAsync(HttpClient client, string host)
    {
        using var response = await SendForHostAsync(client, host);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PublicMenuResponse>())!;
    }

    private sealed class QueryCountingInterceptor : DbCommandInterceptor
    {
        public int ReaderQueryCount { get; private set; }

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result,
            CancellationToken cancellationToken = default)
        {
            ReaderQueryCount++;
            return ValueTask.FromResult(result);
        }
    }
}
