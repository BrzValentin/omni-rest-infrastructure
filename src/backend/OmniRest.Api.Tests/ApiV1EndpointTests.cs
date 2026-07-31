using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OmniRest.Api.Tests;

public sealed class ApiV1EndpointTests(WebApplicationFactory<Program> application)
    : IClassFixture<WebApplicationFactory<Program>>
{
    [Fact]
    public async Task GetApiV1ReturnsVersionInformation()
    {
        using var client = application.CreateClient();

        using var response = await client.GetAsync("/api/v1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var content = await response.Content.ReadFromJsonAsync<ApiVersionResponse>();
        Assert.NotNull(content);
        Assert.Equal("v1", content.Version);
    }

    private sealed record ApiVersionResponse(string Version);
}
