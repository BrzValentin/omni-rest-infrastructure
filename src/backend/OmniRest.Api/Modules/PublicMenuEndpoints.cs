using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;
using OmniRest.Api.Security;

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

    private static async Task<IResult> GetMenuAsync(
        HttpRequest request,
        HttpResponse response,
        IPublicMenuReader reader,
        RestaurantStatusCalculator statusCalculator,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await reader.ReadAsync(request.Host, cancellationToken);
        if (result is null)
        {
            // The same code its sibling public endpoints return. A bare TypedResults.Problem here left the
            // body with the meaningless filled-in http_error, so one 404 out of three was undiscriminated.
            return ApiProblems.Problem(
                StatusCodes.Status404NotFound,
                "public_restaurant_not_found",
                "Restaurant not found",
                "No public restaurant is configured for this host.");
        }

        response.Headers.ETag = result.ETag;
        response.Headers.CacheControl = "public, max-age=0, must-revalidate";
        if (request.Headers.IfNoneMatch
            .SelectMany(value => value?.Split(',', StringSplitOptions.TrimEntries) ?? [])
            .Any(value => value == result.ETag || value == "*"))
        {
            return TypedResults.StatusCode(StatusCodes.Status304NotModified);
        }

        // BUG-007: the nested restaurant gets the same per-request view as /restaurant — current status and no
        // expired special hours — instead of the publish-time copy frozen in the snapshot.
        var menu = result.Response;
        return TypedResults.Ok(menu.Restaurant is null
            ? menu
            : menu with
            {
                Restaurant = PublicSpecialHoursVisibility.AtInstant(menu.Restaurant, statusCalculator, timeProvider.GetUtcNow())
            });
    }
}
