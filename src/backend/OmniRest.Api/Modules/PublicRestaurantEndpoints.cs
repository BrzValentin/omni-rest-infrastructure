using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;
using OmniRest.Api.Security;

namespace OmniRest.Api.Modules;

internal static class PublicRestaurantEndpoints
{
    internal static RouteGroupBuilder MapPublicRestaurantEndpoints(this RouteGroupBuilder publicApi)
    {
        publicApi.MapGet("/restaurant", GetRestaurantAsync)
            .AllowAnonymous()
            .WithName("GetPublicRestaurant")
            .Produces<PublicRestaurantResponse>()
            .Produces(StatusCodes.Status304NotModified)
            .ProducesProblem(StatusCodes.Status404NotFound);
        return publicApi;
    }

    private static async Task<IResult> GetRestaurantAsync(
        HttpRequest request,
        HttpResponse response,
        IPublicMenuReader reader,
        RestaurantStatusCalculator statusCalculator,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var result = await reader.ReadAsync(request.Host, cancellationToken);
        if (result?.Response.Restaurant is not { } restaurant)
        {
            return ApiProblems.Problem(404, "public_restaurant_not_found", "Restaurant not found");
        }

        response.Headers.ETag = result.ETag;
        response.Headers.CacheControl = "public, max-age=0, must-revalidate";
        if (request.Headers.IfNoneMatch.SelectMany(value => value?.Split(',', StringSplitOptions.TrimEntries) ?? [])
            .Any(value => value == result.ETag || value == "*"))
        {
            return TypedResults.StatusCode(StatusCodes.Status304NotModified);
        }

        return TypedResults.Ok(restaurant with { Status = statusCalculator.Calculate(restaurant, timeProvider.GetUtcNow()) });
    }
}
