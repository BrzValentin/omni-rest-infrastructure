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
        publicApi.MapGet("/restaurant/gallery", GetGalleryAsync)
            .AllowAnonymous()
            .WithName("GetPublicRestaurantGallery")
            .WithSummary("Gets the published gallery photos for the request host.")
            .Produces<PublicGalleryResponse>()
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
        if (IsNotModified(request, result.ETag))
        {
            return TypedResults.StatusCode(StatusCodes.Status304NotModified);
        }

        return TypedResults.Ok(restaurant with { Status = statusCalculator.Calculate(restaurant, timeProvider.GetUtcNow()) });
    }

    private static async Task<IResult> GetGalleryAsync(
        HttpRequest request,
        HttpResponse response,
        IPublicMenuReader reader,
        CancellationToken cancellationToken)
    {
        var result = await reader.ReadAsync(request.Host, cancellationToken);
        if (result?.Response.Restaurant is not { } restaurant)
        {
            return ApiProblems.Problem(404, "public_restaurant_not_found", "Restaurant not found");
        }

        // The gallery is part of the publication snapshot, so it shares the restaurant's ETag and cache key.
        response.Headers.ETag = result.ETag;
        response.Headers.CacheControl = "public, max-age=0, must-revalidate";
        if (IsNotModified(request, result.ETag))
        {
            return TypedResults.StatusCode(StatusCodes.Status304NotModified);
        }

        // An empty gallery is not an error.
        return TypedResults.Ok(new PublicGalleryResponse(
            result.Response.PublicationVersion,
            restaurant.Gallery is { } gallery ? gallery : []));
    }

    private static bool IsNotModified(HttpRequest request, string etag) => request.Headers.IfNoneMatch
        .SelectMany(value => value?.Split(',', StringSplitOptions.TrimEntries) ?? [])
        .Any(value => value == etag || value == "*");
}
