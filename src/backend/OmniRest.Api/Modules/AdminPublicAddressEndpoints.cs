using System.Security.Claims;
using OmniRest.Api.Restaurants;
using OmniRest.Api.Security;

namespace OmniRest.Api.Modules;

internal static class AdminPublicAddressEndpoints
{
    internal static RouteGroupBuilder MapAdminPublicAddressEndpoints(this RouteGroupBuilder admin)
    {
        // The owner policy is restated here rather than inherited from whichever sibling module happens
        // to run first, so reordering the /admin chain can never quietly expose this group.
        var publicAddress = admin.MapGroup("/restaurant/public-address")
            .RequireAuthorization(SecurityRegistration.OwnerPolicy);

        // Read-only, so no AntiforgeryEndpointFilter: CSRF protection guards state changes, and a GET
        // that demanded a token would make callers fetch one for nothing.
        publicAddress.MapGet("", ReadAsync)
            .WithName("GetAdminPublicAddress")
            .WithSummary("Gets the public host the signed-in owner's menu is served on.")
            .Produces<AdminPublicAddressResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        return admin;
    }

    private static async Task<IResult> ReadAsync(
        ClaimsPrincipal principal,
        IOwnerRestaurantContext ownerContext,
        IRestaurantPublicAddressService service,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        if (access is null) return TypedResults.Forbid();

        // Resolving access is also what binds the tenant, so the service below reads the caller's own
        // restaurant without this handler passing an id it could get wrong.
        if (await service.GetCurrentAsync(cancellationToken) is not { } address)
        {
            return ApiProblems.Problem(404, "admin_resource_not_found", "Resource not found");
        }

        return TypedResults.Ok(new AdminPublicAddressResponse(
            address.Host, RestaurantPublicAddresses.ToWireValue(address.Source)));
    }
}
