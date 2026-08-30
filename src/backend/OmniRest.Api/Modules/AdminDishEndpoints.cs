using System.Security.Claims;
using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;
using OmniRest.Api.Security;

namespace OmniRest.Api.Modules;

internal static class AdminDishEndpoints
{
    internal static RouteGroupBuilder MapAdminDishEndpoints(this RouteGroupBuilder menu)
    {
        menu.MapPost("/dishes", CreateAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("CreateDish");
        menu.MapPatch("/dishes/reorder", ReorderAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("ReorderDishes");
        menu.MapPatch("/dishes/{id:guid}", UpdateAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("UpdateDish");
        menu.MapPatch("/dishes/{id:guid}/price", UpdatePriceAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("UpdateDishPrice");
        menu.MapPatch("/dishes/{id:guid}/availability", UpdateAvailabilityAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("UpdateDishAvailability");
        menu.MapDelete("/dishes/{id:guid}", DeleteAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("DeleteDish");
        return menu;
    }

    private static async Task<IResult> CreateAsync(
        CreateDishRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IMenuManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = MenuManagementValidation.ValidateCreateDish(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await AdminMenuEndpoints.MutateMenuAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.CreateDishAsync(access, etag, request!, cancellationToken));
    }

    private static async Task<IResult> UpdateAsync(
        Guid id,
        UpdateDishRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IMenuManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = MenuManagementValidation.ValidateUpdateDish(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await AdminMenuEndpoints.MutateMenuAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.UpdateDishAsync(access, id, etag, request!, cancellationToken));
    }

    private static async Task<IResult> UpdatePriceAsync(
        Guid id,
        UpdateDishPriceRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IMenuManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = MenuManagementValidation.ValidateDishPrice(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await AdminMenuEndpoints.MutateMenuAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.UpdateDishPriceAsync(access, id, etag, request!, cancellationToken));
    }

    private static async Task<IResult> UpdateAvailabilityAsync(
        Guid id,
        UpdateDishAvailabilityRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IMenuManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = MenuManagementValidation.ValidateDishAvailability(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await AdminMenuEndpoints.MutateMenuAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.UpdateDishAvailabilityAsync(access, id, etag, request!, cancellationToken));
    }

    private static Task<IResult> DeleteAsync(
        Guid id,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IMenuManagementService service,
        CancellationToken cancellationToken) => AdminMenuEndpoints.MutateMenuAsync(
            principal, httpRequest, response, ownerContext,
            (access, etag) => service.DeleteDishAsync(access, id, etag, cancellationToken));

    private static async Task<IResult> ReorderAsync(
        ReorderDishesRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IMenuManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = MenuManagementValidation.ValidateReorderDishes(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await AdminMenuEndpoints.MutateMenuAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.ReorderDishesAsync(access, etag, request!, cancellationToken));
    }
}
