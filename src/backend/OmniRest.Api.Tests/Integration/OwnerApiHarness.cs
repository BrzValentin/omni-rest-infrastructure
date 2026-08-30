using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using OmniRest.Api.Data;
using OmniRest.Api.Security;

namespace OmniRest.Api.Tests.Integration;

/// <summary>
/// Shared owner-portal request helpers for admin integration tests.
/// </summary>
internal static class OwnerApiHarness
{
    internal const string Password = "Correct-Horse-9!Battery";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    internal static HttpClient CreateSecureClient(WebApplicationFactory<Program> factory) => factory.CreateClient(
        new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = true,
            AllowAutoRedirect = false
        });

    internal static async Task LoginAsync(HttpClient client, string email)
    {
        var token = await GetAntiforgeryAsync(client);
        using var response = await SendAsync(client, HttpMethod.Post, "/api/v1/auth/login",
            new LoginRequest(email, Password, null), token, null);
        Assert.Equal(System.Net.HttpStatusCode.OK, response.StatusCode);
    }

    internal static async Task<string> GetAntiforgeryAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<AntiforgeryResponse>("/api/v1/auth/antiforgery"))!.Token;

    internal static async Task<HttpResponseMessage> SendAsync<T>(
        HttpClient client, HttpMethod method, string uri, T? body, string? token, string? etag)
    {
        var request = new HttpRequestMessage(method, uri);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (token is not null) request.Headers.Add("X-CSRF-TOKEN", token);
        if (etag is not null) request.Headers.TryAddWithoutValidation("If-Match", etag);
        return await client.SendAsync(request);
    }

    internal static async Task<HttpResponseMessage> SendRawAsync(
        HttpClient client, HttpMethod method, string uri, string json, string token, string? etag)
    {
        var request = new HttpRequestMessage(method, uri)
        {
            Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
        };
        request.Headers.Add("X-CSRF-TOKEN", token);
        if (etag is not null) request.Headers.TryAddWithoutValidation("If-Match", etag);
        return await client.SendAsync(request);
    }

    internal static async Task<TResponse> ExpectOkAsync<TResponse>(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == System.Net.HttpStatusCode.OK,
            $"Expected 200 but received {(int)response.StatusCode}: {payload}");
        return JsonSerializer.Deserialize<TResponse>(payload, Json)!;
    }

    internal static async Task CreateOwnerAsync(MenuApiFactory factory, Guid restaurantId, string email)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<OwnerUser>>();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var user = new OwnerUser
        {
            Id = Guid.NewGuid(),
            Email = email,
            UserName = email,
            EmailConfirmed = true,
            DisplayName = "Manager",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        var created = await userManager.CreateAsync(user, Password);
        Assert.True(created.Succeeded, string.Join(",", created.Errors.Select(item => item.Code)));
        db.RestaurantMemberships.Add(new RestaurantMembershipEntity
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            RestaurantId = restaurantId,
            Role = MembershipRoles.Owner,
            Status = MembershipStatuses.Active,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
    }
}
