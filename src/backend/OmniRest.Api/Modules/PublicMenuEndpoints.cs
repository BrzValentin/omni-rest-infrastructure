using Microsoft.AspNetCore.Http.HttpResults;
using OmniRest.Api.Menus;

namespace OmniRest.Api.Modules;

internal static class PublicMenuEndpoints
{
    internal static RouteGroupBuilder MapPublicMenuEndpoints(this RouteGroupBuilder publicApi)
    {
        publicApi.MapGet("/menu", GetMenuAsync)
            .AllowAnonymous()
            .WithName("GetPublicMenu")
            .WithSummary("Gets the current published menu for the request host.")
            .Produces<PublicMenuResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status304NotModified)
            .ProducesProblem(StatusCodes.Status404NotFound);

        return publicApi;
    }

    private static async Task<Results<Ok<PublicMenuResponse>, StatusCodeHttpResult, ProblemHttpResult>> GetMenuAsync(
        HttpRequest request,
        HttpResponse response,
        IPublicMenuReader reader,
        CancellationToken cancellationToken)
    {
        var result = await reader.ReadAsync(request.Host, cancellationToken);
        if (result is null)
        {
            return TypedResults.Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Restaurant not found",
                detail: "No public restaurant is configured for this host.",
                type: "https://httpstatuses.com/404");
        }

        response.Headers.ETag = result.ETag;
        response.Headers.CacheControl = "public, max-age=0, must-revalidate";
        if (request.Headers.IfNoneMatch
            .SelectMany(value => value?.Split(',', StringSplitOptions.TrimEntries) ?? [])
            .Any(value => value == result.ETag || value == "*"))
        {
            return TypedResults.StatusCode(StatusCodes.Status304NotModified);
        }

        return TypedResults.Ok(result.Response);
    }
}
