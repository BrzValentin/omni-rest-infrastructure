using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;
using OmniRest.Api.Security;

namespace OmniRest.Api.Modules;

internal static class AdminGalleryEndpoints
{
    internal static RouteGroupBuilder MapAdminGalleryEndpoints(this RouteGroupBuilder admin)
    {
        var gallery = admin.MapGroup("/gallery");

        gallery.MapGet("", ReadGalleryAsync).WithName("GetAdminGallery");
        gallery.MapPost("", UploadImageAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>()
            .WithMetadata(new RequestSizeLimitAttribute(6 * 1024 * 1024))
            .WithName("UploadGalleryImage");

        // The literal segment must be mapped before the parameterized one.
        gallery.MapPatch("/reorder", ReorderImagesAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("ReorderGalleryImages");
        gallery.MapPatch("/{id:guid}", UpdateImageAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("UpdateGalleryImage");
        gallery.MapDelete("/{id:guid}", DeleteImageAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("DeleteGalleryImage");

        return admin;
    }

    private static async Task<IResult> ReadGalleryAsync(
        ClaimsPrincipal principal,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IGalleryManagementService service,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        if (access is null) return TypedResults.Forbid();
        var result = await service.ReadGalleryAsync(access, cancellationToken);
        if (result.Value is not null)
        {
            response.Headers.ETag = result.Value.ETag;
        }
        return ToHttpResult(result);
    }

    private static async Task<IResult> UploadImageAsync(
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IGalleryManagementService service,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        if (access is null) return TypedResults.Forbid();
        if (!httpRequest.HasFormContentType)
        {
            return ApiProblems.Validation(new Dictionary<string, string[]>(StringComparer.Ordinal)
            {
                ["file"] = [GalleryValidation.MediaFormRequired]
            });
        }

        var form = await httpRequest.ReadFormAsync(cancellationToken);
        var result = await service.UploadImageAsync(
            access,
            httpRequest.Headers.IfMatch.ToString(),
            form["altText"].FirstOrDefault(),
            form["caption"].FirstOrDefault(),
            form.Files.GetFile("file"),
            cancellationToken);
        if (result.Value is null)
        {
            return ToHttpResult(result);
        }

        WriteMutationHeaders(response, result.Value);
        var created = result.Value.Gallery.Images[^1];
        return TypedResults.Created($"/api/v1/admin/gallery/{created.Id}", result.Value);
    }

    private static async Task<IResult> UpdateImageAsync(
        Guid id,
        UpdateGalleryImageRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IGalleryManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = GalleryValidation.ValidateUpdate(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await MutateGalleryAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.UpdateImageAsync(access, id, etag, request!, cancellationToken));
    }

    private static Task<IResult> DeleteImageAsync(
        Guid id,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IGalleryManagementService service,
        CancellationToken cancellationToken) => MutateGalleryAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.DeleteImageAsync(access, id, etag, cancellationToken));

    private static async Task<IResult> ReorderImagesAsync(
        ReorderGalleryImagesRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IGalleryManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = GalleryValidation.ValidateReorder(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await MutateGalleryAsync(principal, httpRequest, response, ownerContext,
            (access, etag) => service.ReorderImagesAsync(access, etag, request!, cancellationToken));
    }

    private static async Task<IResult> MutateGalleryAsync(
        ClaimsPrincipal principal,
        HttpRequest request,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        Func<OwnerRestaurantAccess, string?, Task<ManagementResult<AdminGalleryMutationResponse>>> mutation)
    {
        var access = await ownerContext.ResolveAsync(principal, request.HttpContext.RequestAborted);
        if (access is null) return TypedResults.Forbid();
        var result = await mutation(access, request.Headers.IfMatch.ToString());
        if (result.Value is not null)
        {
            WriteMutationHeaders(response, result.Value);
        }
        return ToHttpResult(result);
    }

    private static void WriteMutationHeaders(HttpResponse response, AdminGalleryMutationResponse value)
    {
        response.Headers.ETag = value.Gallery.ETag;
        response.Headers["X-Publication-Operation-Id"] = value.Publication.OperationId;
    }

    private static IResult ToHttpResult<T>(ManagementResult<T> result)
    {
        if (result.Value is not null) return TypedResults.Ok(result.Value);
        var failure = result.Failure ?? new ManagementFailure(500, "unexpected_error", "Unexpected error");
        if (failure.Errors is not null) return ApiProblems.Validation(failure.Errors);
        return ApiProblems.Problem(failure.Status, failure.Code, failure.Title, currentVersion: failure.CurrentVersion);
    }
}
