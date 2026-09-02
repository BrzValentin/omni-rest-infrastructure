using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Tests.Integration;

/// <summary>
/// One place that pins the error contract itself rather than any single endpoint's failure: every error
/// body this API produces is <c>application/problem+json</c>, names a machine-readable <c>code</c>,
/// carries a <c>correlationId</c>, and never leaks a stack trace or exception detail — including for a
/// genuinely unhandled fault (PR-22).
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class ErrorContractApiTests(PostgresFixture postgres)
{
    private const string Email = "contract-manager@example.test";

    /// <summary>Keys that would mean the generic 500 body had leaked implementation detail.</summary>
    private static readonly string[] ForbiddenKeys =
        ["stackTrace", "StackTrace", "exception", "Exception", "innerException", "trace"];

    [Fact]
    public async Task EveryErrorBodyIsProblemJsonWithCodeAndCorrelationIdAndNoStackTrace()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await OwnerApiHarness.CreateOwnerAsync(factory, GuardedSampleDataSeeder.OrdinaryRestaurantId, Email);
        using var client = OwnerApiHarness.CreateSecureClient(factory);

        // A public 404, a public 404 from the sibling endpoint, and an admin 400 for a bad CSRF token:
        // three different producers of an error body, one contract between them.
        var observed = new List<(string Label, string Code, HttpStatusCode Status)>();

        using (var unknownHost = new HttpRequestMessage(HttpMethod.Get, "/api/v1/public/menu"))
        {
            unknownHost.Headers.Host = "nobody.localhost";
            using var response = await client.SendAsync(unknownHost);
            observed.Add(("public menu", await AssertProblemAsync(response, HttpStatusCode.NotFound), response.StatusCode));
        }

        using (var unknownHost = new HttpRequestMessage(HttpMethod.Get, "/api/v1/public/restaurant"))
        {
            unknownHost.Headers.Host = "nobody.localhost";
            using var response = await client.SendAsync(unknownHost);
            observed.Add(("public restaurant", await AssertProblemAsync(response, HttpStatusCode.NotFound), response.StatusCode));
        }

        await OwnerApiHarness.LoginAsync(client, Email);
        var draft = await client.GetFromJsonAsync<AdminRestaurantResponse>("/api/v1/admin/restaurant");
        Assert.NotNull(draft);

        using (var response = await OwnerApiHarness.SendRawAsync(
            client, HttpMethod.Put, "/api/v1/admin/restaurant/profile", "{}", "not-a-real-token", draft.ETag))
        {
            observed.Add(("csrf", await AssertProblemAsync(response, HttpStatusCode.BadRequest), response.StatusCode));
        }

        using (var response = await OwnerApiHarness.SendRawAsync(
            client,
            HttpMethod.Put,
            "/api/v1/admin/restaurant/profile",
            """{"name":"","timeZone":"Not/AZone","address":null}""",
            await OwnerApiHarness.GetAntiforgeryAsync(client),
            draft.ETag))
        {
            observed.Add(("validation", await AssertProblemAsync(response, HttpStatusCode.BadRequest), response.StatusCode));
        }

        using (var response = await client.GetAsync(
            $"/api/v1/admin/publication-status/{Guid.NewGuid()}"))
        {
            observed.Add(("admin 404", await AssertProblemAsync(response, HttpStatusCode.NotFound), response.StatusCode));
        }

        Assert.Equal(
            ["public_restaurant_not_found", "public_restaurant_not_found", "csrf_invalid", "admin_validation", "admin_resource_not_found"],
            observed.Select(item => item.Code));
        Assert.DoesNotContain(observed, item => item.Code is "http_error" or "unexpected_error");
    }

    [Fact]
    public async Task UnhandledFaultBecomesTheGenericFiveHundredProblemWithoutLeakingDetail()
    {
        using var baseFactory = postgres.CreateFactory();
        using var factory = baseFactory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IPublicMenuReader>();
            services.AddScoped<IPublicMenuReader, ThrowingPublicMenuReader>();
        }));
        await postgres.RecreateLatestAndSeedAsync(baseFactory);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/public/menu");
        request.Headers.Host = "menu.localhost";
        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var code = await AssertProblemAsync(response, HttpStatusCode.InternalServerError);
        Assert.Equal("unexpected_error", code);

        var payload = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(ThrowingPublicMenuReader.Secret, payload, StringComparison.Ordinal);
        Assert.DoesNotContain(nameof(ThrowingPublicMenuReader), payload, StringComparison.Ordinal);
        Assert.DoesNotContain("OmniRest.Api", payload, StringComparison.Ordinal);
    }

    /// <summary>
    /// The exception handler now sits above the tenant media mount, so a fault raised while serving a
    /// blob is a ProblemDetails body rather than the raw connection reset it used to be (PR-22 Task 18).
    /// </summary>
    [Fact]
    public async Task FaultsInTheTenantMediaMountStillProduceAProblemBody()
    {
        using var baseFactory = postgres.CreateFactory();
        using var factory = baseFactory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IRestaurantResolver>();
            services.AddScoped<IRestaurantResolver, ThrowingRestaurantResolver>();
        }));
        await postgres.RecreateLatestAndSeedAsync(baseFactory);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

        // The mount rejects any first segment that is not an "N"-format GUID before it resolves a tenant,
        // so the path has to carry a well-formed restaurant directory for the resolver — and therefore the
        // injected fault — to be reached at all.
        var ownerDirectory = Guid.NewGuid().ToString("N");
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/media/uploads/{ownerDirectory}/image.png");
        request.Headers.Host = "menu.localhost";
        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("unexpected_error", await AssertProblemAsync(response, HttpStatusCode.InternalServerError));
    }

    private static async Task<string> AssertProblemAsync(HttpResponseMessage response, HttpStatusCode expected)
    {
        var payload = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"Expected {(int)expected} but received {(int)response.StatusCode}: {payload}");
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = JsonSerializer.Deserialize<JsonElement>(payload);
        Assert.Equal((int)expected, problem.GetProperty("status").GetInt32());
        var code = problem.GetProperty("code").GetString();
        Assert.False(string.IsNullOrWhiteSpace(code), $"An error body must name a code: {payload}");
        Assert.False(string.IsNullOrWhiteSpace(problem.GetProperty("correlationId").GetString()),
            $"An error body must carry a correlationId: {payload}");
        foreach (var forbidden in ForbiddenKeys)
        {
            Assert.False(problem.TryGetProperty(forbidden, out _),
                $"An error body must never carry '{forbidden}': {payload}");
        }
        return code!;
    }

    private sealed class ThrowingPublicMenuReader : IPublicMenuReader
    {
        internal const string Secret = "connection string Password=super-secret";

        public Task<PublicMenuReadResult?> ReadAsync(HostString host, CancellationToken cancellationToken) =>
            throw new InvalidOperationException(Secret);
    }

    private sealed class ThrowingRestaurantResolver : IRestaurantResolver
    {
        public Task<RestaurantResolution?> ResolveAsync(HostString host, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("Injected tenant-media resolution failure.");
    }
}
