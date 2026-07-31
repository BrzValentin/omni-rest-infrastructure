namespace OmniRest.Api.Modules;

internal static class ApiV1Endpoints
{
    internal static IEndpointRouteBuilder MapApiV1Endpoints(this IEndpointRouteBuilder endpoints)
    {
        var apiV1 = endpoints.MapGroup("/api/v1");

        apiV1.MapGet("", () => TypedResults.Ok(new ApiVersionResponse("v1")));

        return endpoints;
    }

    private sealed record ApiVersionResponse(string Version);
}
