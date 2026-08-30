using System.Security.Claims;
using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;
using OmniRest.Api.Security;

namespace OmniRest.Api.Modules;

internal static class AdminMenuEndpoints
{
    internal static RouteGroupBuilder MapAdminMenuEndpoints(this RouteGroupBuilder admin)
    {
        var menu = admin.MapGroup("/menu");
        menu.MapAdminDishEndpoints();

        menu.MapGet("", ReadMenuAsync).WithName("GetAdminMenu");
        menu.MapPost("/categories", CreateCategoryAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("CreateMenuCategory");
        menu.MapPatch("/categories/reorder", ReorderCategoriesAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("ReorderMenuCategories");
        menu.MapPatch("/categories/{id:guid}", UpdateCategoryAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("UpdateMenuCategory");
        menu.MapDelete("/categories/{id:guid}", DeleteCategoryAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("DeleteMenuCategory");

        return admin;
    }

    private static async Task<IResult> ReadMenuAsync(
        ClaimsPrincipal principal,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IMenuManagementService service,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        if (access is null) return TypedResults.Forbid();
        var result = await service.ReadMenuAsync(access, cancellationToken);
        if (result.Value is not null)
        {
            response.Headers.ETag = result.Value.ETag;
        }
        return ToHttpResult(result);
    }

    private static async Task<IResult> CreateCategoryAsync(
        CreateMenuCategoryRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IMenuManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = MenuManagementValidation.ValidateCreateCategory(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await MutateMenuAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.CreateCategoryAsync(access, etag, request!, cancellationToken));
    }

    private static async Task<IResult> UpdateCategoryAsync(
        Guid id,
        UpdateMenuCategoryRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IMenuManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = MenuManagementValidation.ValidateUpdateCategory(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await MutateMenuAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.UpdateCategoryAsync(access, id, etag, request!, cancellationToken));
    }

    private static Task<IResult> DeleteCategoryAsync(
        Guid id,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IMenuManagementService service,
        CancellationToken cancellationToken) => MutateMenuAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.DeleteCategoryAsync(access, id, etag, cancellationToken));

    private static async Task<IResult> ReorderCategoriesAsync(
        ReorderMenuCategoriesRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IMenuManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = MenuManagementValidation.ValidateReorderCategories(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await MutateMenuAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.ReorderCategoriesAsync(access, etag, request!, cancellationToken));
    }

    internal static async Task<IResult> MutateMenuAsync(
        ClaimsPrincipal principal,
        HttpRequest request,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        Func<OwnerRestaurantAccess, string?, Task<ManagementResult<AdminMenuMutationResponse>>> mutation)
    {
        var access = await ownerContext.ResolveAsync(principal, request.HttpContext.RequestAborted);
        if (access is null) return TypedResults.Forbid();
        var result = await mutation(access, request.Headers.IfMatch.ToString());
        if (result.Value is not null)
        {
            response.Headers.ETag = result.Value.Menu.ETag;
            response.Headers["X-Publication-Operation-Id"] = result.Value.Publication.OperationId;
        }
        return ToHttpResult(result);
    }

    private static IResult ToHttpResult<T>(ManagementResult<T> result)
    {
        if (result.Value is not null) return TypedResults.Ok(result.Value);
        var failure = result.Failure ?? new ManagementFailure(500, "unexpected_error", "Unexpected error");
        if (failure.Errors is not null) return ApiProblems.Validation(failure.Errors);
        return ApiProblems.Problem(failure.Status, failure.Code, failure.Title, currentVersion: failure.CurrentVersion);
    }
}
