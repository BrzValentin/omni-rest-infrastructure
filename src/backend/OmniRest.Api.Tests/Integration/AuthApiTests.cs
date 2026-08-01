using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Security;

namespace OmniRest.Api.Tests.Integration;

[Collection(PostgresCollection.Name)]
public sealed class AuthApiTests(PostgresFixture postgres)
{
    private const string Email = "owner@example.test";
    private const string Password = "Correct-Horse-9!Battery";

    [Fact]
    public async Task AntiforgeryLoginSessionLogoutAndSecurityHeadersWorkTogether()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory);
        using var client = CreateSecureClient(factory);

        using var rejected = await client.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(Email, Password, "/admin/restaurant"));
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);

        var token = await GetAntiforgeryAsync(client);
        var nullRequest = new HttpRequestMessage(HttpMethod.Post, "/api/v1/auth/login")
        {
            Content = new StringContent("null", System.Text.Encoding.UTF8, "application/json")
        };
        nullRequest.Headers.Add("X-CSRF-TOKEN", token);
        using var nullResponse = await client.SendAsync(nullRequest);
        Assert.Equal(HttpStatusCode.BadRequest, nullResponse.StatusCode);
        Assert.Contains("auth_validation", await nullResponse.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        token = await GetAntiforgeryAsync(client);
        using var login = await PostWithTokenAsync(client, "/api/v1/auth/login", new LoginRequest(Email, Password, "/admin/restaurant"), token);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Contains(login.Headers.TryGetValues("Set-Cookie", out var cookies) ? cookies : [],
            value => value.Contains(".OmniRest.Owner=", StringComparison.Ordinal) &&
                value.Contains("secure", StringComparison.OrdinalIgnoreCase) &&
                value.Contains("httponly", StringComparison.OrdinalIgnoreCase) &&
                value.Contains("samesite=lax", StringComparison.OrdinalIgnoreCase));
        Assert.Equal("nosniff", login.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", login.Headers.GetValues("X-Frame-Options").Single());

        var session = await client.GetFromJsonAsync<SessionResponse>("/api/v1/auth/session");
        Assert.NotNull(session);
        Assert.Equal("Owner", session.DisplayName);
        Assert.Equal("/admin", session.ReturnPath);
        Assert.Single(session.Memberships);
        Assert.Equal(MembershipRoles.Owner, session.Memberships[0].Role);
        Assert.True(session.AbsoluteExpiresAt > session.IdleExpiresAt);

        token = await GetAntiforgeryAsync(client);
        using var logout = await PostWithTokenAsync(client, "/api/v1/auth/logout", new { }, token);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        using var afterLogout = await client.GetAsync("/api/v1/auth/session");
        Assert.Equal(HttpStatusCode.Unauthorized, afterLogout.StatusCode);
    }

    [Fact]
    public async Task LoginThrottlingPartitionsByNormalizedIdentityAcrossCookieJarsAndSpoofedHeaders()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory);

        for (var identity = 0; identity < 6; identity++)
        {
            using var client = CreateSecureClient(factory);
            using var invalid = await PostWithTokenAsync(
                client,
                "/api/v1/auth/login",
                new LoginRequest($"independent{identity}@example.test", "Wrong-Password-9!", null),
                await GetAntiforgeryAsync(client),
                forwardedFor: $"203.0.113.{identity + 1}",
                forwardedProto: identity % 2 == 0 ? "http" : "https");
            Assert.Equal(HttpStatusCode.Unauthorized, invalid.StatusCode);
        }

        string? unknownFailure = null;
        for (var attempt = 0; attempt < 6; attempt++)
        {
            using var client = CreateSecureClient(factory);
            var identity = attempt % 2 == 0 ? "SHARED@example.test" : "shared@EXAMPLE.TEST";
            using var response = await PostWithTokenAsync(
                client,
                "/api/v1/auth/login",
                new LoginRequest(identity, "Wrong-Password-9!", null),
                await GetAntiforgeryAsync(client),
                forwardedFor: $"198.51.100.{attempt + 1}",
                forwardedProto: attempt % 2 == 0 ? "http" : "https");
            Assert.Equal(attempt < 5 ? HttpStatusCode.Unauthorized : HttpStatusCode.TooManyRequests, response.StatusCode);
            var payload = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain("shared@example.test", payload, StringComparison.OrdinalIgnoreCase);
            if (attempt == 0) unknownFailure = CredentialFailureShape(payload);
            if (attempt == 5)
            {
                Assert.Contains("auth_rate_limited", payload, StringComparison.Ordinal);
                Assert.True(response.Headers.RetryAfter?.Delta > TimeSpan.Zero);
            }
        }

        string? knownFailure = null;
        for (var attempt = 0; attempt < 6; attempt++)
        {
            using var client = CreateSecureClient(factory);
            using var response = await PostWithTokenAsync(
                client,
                "/api/v1/auth/login",
                new LoginRequest(Email, "Wrong-Password-9!", null),
                await GetAntiforgeryAsync(client),
                forwardedFor: $"192.0.2.{attempt + 1}");
            Assert.Equal(attempt < 5 ? HttpStatusCode.Unauthorized : HttpStatusCode.TooManyRequests, response.StatusCode);
            var payload = await response.Content.ReadAsStringAsync();
            if (attempt == 0) knownFailure = CredentialFailureShape(payload);
        }

        Assert.Equal(unknownFailure, knownFailure);
        await using var scope = factory.Services.CreateAsyncScope();
        var user = await scope.ServiceProvider.GetRequiredService<MenuDbContext>().Users.SingleAsync();
        // Identity resets the counter when the configured threshold is reached and records the lockout.
        Assert.Equal(0, user.AccessFailedCount);
        Assert.True(user.LockoutEnd > DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task RevokedMembershipImmediatelyInvalidatesExistingCookie()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory);
        using var client = CreateSecureClient(factory);
        var token = await GetAntiforgeryAsync(client);
        using var login = await PostWithTokenAsync(client, "/api/v1/auth/login", new LoginRequest(Email, Password, null), token);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var membership = await db.RestaurantMemberships.SingleAsync();
            membership.Status = MembershipStatuses.Revoked;
            membership.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
        }

        using var session = await client.GetAsync("/api/v1/auth/session");
        Assert.Equal(HttpStatusCode.Unauthorized, session.StatusCode);
    }

    [Fact]
    public async Task UnknownInactiveAndNoMembershipAccountsShareTheGenericCredentialFailure()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var manager = scope.ServiceProvider.GetRequiredService<UserManager<OwnerUser>>();
            foreach (var (email, active) in new[] { ("inactive@example.test", false), ("nomembership@example.test", true) })
            {
                var user = new OwnerUser { Id = Guid.NewGuid(), Email = email, UserName = email, EmailConfirmed = true, DisplayName = "Hidden", IsActive = active, CreatedAt = DateTimeOffset.UtcNow };
                Assert.True((await manager.CreateAsync(user, Password)).Succeeded);
            }
        }
        using var client = CreateSecureClient(factory);
        foreach (var email in new[] { "unknown@example.test", "inactive@example.test", "nomembership@example.test" })
        {
            using var response = await PostWithTokenAsync(client, "/api/v1/auth/login",
                new LoginRequest(email, Password, null), await GetAntiforgeryAsync(client));
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            var payload = await response.Content.ReadAsStringAsync();
            Assert.Contains("auth_invalid_credentials", payload, StringComparison.Ordinal);
            Assert.DoesNotContain(email, payload, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task AbsoluteSessionLifetimeRejectsAnOtherwiseValidCookie()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        await CreateOwnerAsync(factory);
        using var client = CreateSecureClient(factory);
        var token = await GetAntiforgeryAsync(client);
        using var login = await PostWithTokenAsync(client, "/api/v1/auth/login", new LoginRequest(Email, Password, null), token);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var user = await db.Users.SingleAsync();
            user.CurrentSessionStartedAt = DateTimeOffset.UtcNow - TimeSpan.FromHours(13);
            await db.SaveChangesAsync();
        }

        using var session = await client.GetAsync("/api/v1/auth/session");
        Assert.Equal(HttpStatusCode.Unauthorized, session.StatusCode);
    }

    [Fact]
    public void ProductionFailsClosedWithoutDurableProtectedDataProtectionConfiguration()
    {
        using var factory = postgres.CreateFactory();
        using var production = factory.WithWebHostBuilder(builder => builder.UseEnvironment("Production"));
        var exception = Assert.ThrowsAny<Exception>(() => production.CreateClient());
        Assert.Contains("DataProtection", exception.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task ControlledProvisioningCreatesIdentityMembershipAndAuditWithoutPersistingPlainPassword()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);
        var prior = Environment.GetEnvironmentVariable(OwnerProvisioning.PasswordEnvironmentVariable);
        try
        {
            Environment.SetEnvironmentVariable(OwnerProvisioning.PasswordEnvironmentVariable, Password);
            await using var scope = factory.Services.CreateAsyncScope();
            var environment = scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Hosting.IHostEnvironment>();
            await OwnerProvisioning.ProvisionAsync(
                factory.Services, environment, Email, GuardedSampleDataSeeder.OrdinaryRestaurantId, "Provisioned Owner");
        }
        finally
        {
            Environment.SetEnvironmentVariable(OwnerProvisioning.PasswordEnvironmentVariable, prior);
        }

        await using var verifyScope = factory.Services.CreateAsyncScope();
        var db = verifyScope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var user = await db.Users.SingleAsync();
        Assert.Equal("Provisioned Owner", user.DisplayName);
        Assert.NotNull(user.PasswordHash);
        Assert.DoesNotContain(Password, user.PasswordHash, StringComparison.Ordinal);
        Assert.Single(await db.RestaurantMemberships.Where(item => item.UserId == user.Id).ToArrayAsync());
        Assert.Single(await db.AuditEvents.Where(item => item.Action == "owner.provisioned").ToArrayAsync());
    }

    private static HttpClient CreateSecureClient(MenuApiFactory factory) => factory.CreateClient(
        new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = true,
            AllowAutoRedirect = false
        });

    private static async Task<string> GetAntiforgeryAsync(HttpClient client)
    {
        var response = await client.GetFromJsonAsync<AntiforgeryResponse>("/api/v1/auth/antiforgery");
        return response!.Token;
    }

    private static async Task<HttpResponseMessage> PostWithTokenAsync<T>(
        HttpClient client, string uri, T body, string token, string? forwardedFor = null, string? forwardedProto = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, uri) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token);
        if (forwardedFor is not null) request.Headers.TryAddWithoutValidation("X-Forwarded-For", forwardedFor);
        if (forwardedProto is not null) request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", forwardedProto);
        return await client.SendAsync(request);
    }

    private static async Task CreateOwnerAsync(MenuApiFactory factory)
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
            DisplayName = "Owner",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var result = await userManager.CreateAsync(user, Password);
        Assert.True(result.Succeeded, string.Join(", ", result.Errors.Select(item => item.Code)));
        db.RestaurantMemberships.Add(new RestaurantMembershipEntity
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            RestaurantId = GuardedSampleDataSeeder.OrdinaryRestaurantId,
            Role = MembershipRoles.Owner,
            Status = MembershipStatuses.Active,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
    }

    private static string CredentialFailureShape(string payload)
    {
        using var document = System.Text.Json.JsonDocument.Parse(payload);
        var root = document.RootElement;
        return string.Join('|',
            root.GetProperty("code").GetString(),
            root.GetProperty("title").GetString(),
            root.GetProperty("detail").GetString());
    }
}
