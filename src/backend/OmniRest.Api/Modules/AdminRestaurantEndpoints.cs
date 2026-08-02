using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using OmniRest.Api.Restaurants;
using OmniRest.Api.Security;

namespace OmniRest.Api.Modules;

internal static class AdminRestaurantEndpoints
{
    internal static RouteGroupBuilder MapAdminRestaurantEndpoints(this RouteGroupBuilder admin)
    {
        admin.RequireAuthorization(SecurityRegistration.OwnerPolicy);
        admin.WithMetadata(new RequestSizeLimitAttribute(65536));

        admin.MapGet("/restaurant", ReadAsync).WithName("GetAdminRestaurant");
        admin.MapPut("/restaurant/profile", UpdateProfileAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("UpdateRestaurantProfile");
        admin.MapPut("/restaurant/regular-hours", ReplaceRegularHoursAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("ReplaceRegularHours");
        admin.MapPut("/restaurant/social-links", ReplaceSocialLinksAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("ReplaceSocialLinks");
        admin.MapPut("/restaurant/main-image", SelectMainImageAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("SelectMainImage");
        admin.MapDelete("/restaurant/main-image", RemoveMainImageAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("RemoveMainImage");
        admin.MapGet("/media-assets", ListReadyMediaAsync).WithName("ListReadyMediaAssets");
        admin.MapPost("/media-assets", UploadMediaAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>()
            .WithMetadata(new RequestSizeLimitAttribute(6 * 1024 * 1024))
            .WithName("UploadMediaAsset");
        admin.MapPut("/media-assets/{id:guid}/alt-text", UpdateMediaAltTextAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("UpdateMediaAltText");
        admin.MapGet("/restaurant/preview", PreviewAsync).WithName("PreviewRestaurantDraft");

        admin.MapGet("/special-hours", ReadSpecialHoursAsync).WithName("GetSpecialHours");
        admin.MapPost("/special-hours", CreateSpecialHoursAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("CreateSpecialHours");
        admin.MapPut("/special-hours/{id:guid}", UpdateSpecialHoursAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("UpdateSpecialHours");
        admin.MapDelete("/special-hours/{id:guid}", DeleteSpecialHoursAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("DeleteSpecialHours");

        admin.MapGet("/publication-status/{operationId:guid}", GetPublicationStatusAsync)
            .WithName("GetPublicationStatus");
        admin.MapPost("/publication-status/{operationId:guid}/retry", RetryPublicationAsync)
            .AddEndpointFilter<AntiforgeryEndpointFilter>().WithName("RetryPublication");
        return admin;
    }

    private static async Task<IResult> ReadAsync(
        ClaimsPrincipal principal,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        if (access is null) return TypedResults.Forbid();
        var result = await service.ReadAsync(access, cancellationToken);
        if (result.Value is not null)
        {
            response.Headers.ETag = result.Value.ETag;
        }
        return ToHttpResult(result);
    }

    private static async Task<IResult> UpdateProfileAsync(
        UpdateRestaurantProfileRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = RestaurantValidation.ValidateProfile(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await MutateAsync(principal, httpRequest, response, ownerContext, service,
            (access, etag) => service.UpdateProfileAsync(access, etag, request!, cancellationToken), cancellationToken);
    }

    private static async Task<IResult> ReplaceRegularHoursAsync(
        UpdateRegularHoursRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = RestaurantValidation.ValidateRegularHours(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await MutateAsync(principal, httpRequest, response, ownerContext, service,
            (access, etag) => service.ReplaceRegularHoursAsync(access, etag, request!, cancellationToken), cancellationToken);
    }

    private static async Task<IResult> ReplaceSocialLinksAsync(
        UpdateSocialLinksRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = RestaurantValidation.ValidateSocialLinks(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await MutateAsync(principal, httpRequest, response, ownerContext, service,
            (access, etag) => service.ReplaceSocialLinksAsync(access, etag, request!, cancellationToken), cancellationToken);
    }

    private static Task<IResult> SelectMainImageAsync(
        SelectMainImageRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        if (request is null) return Task.FromResult<IResult>(ApiProblems.Validation(new Dictionary<string, string[]> { ["request"] = ["request_required"] }));
        return MutateAsync(principal, httpRequest, response, ownerContext, service,
            (access, etag) => service.SelectMainImageAsync(access, etag, request, cancellationToken), cancellationToken);
    }

    private static Task<IResult> RemoveMainImageAsync(
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken) => MutateAsync(
            principal, httpRequest, response, ownerContext, service,
            (access, etag) => service.SelectMainImageAsync(access, etag, new SelectMainImageRequest(null), cancellationToken), cancellationToken);

    private static async Task<IResult> ListReadyMediaAsync(
        ClaimsPrincipal principal,
        IOwnerRestaurantContext ownerContext,
        IMediaAssetService mediaService,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        return access is null ? TypedResults.Forbid() : TypedResults.Ok(await mediaService.ListReadyAsync(access, cancellationToken));
    }

    private static async Task<IResult> UploadMediaAsync(
        HttpRequest request,
        ClaimsPrincipal principal,
        IOwnerRestaurantContext ownerContext,
        IMediaAssetService mediaService,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        if (access is null) return TypedResults.Forbid();
        if (!request.HasFormContentType) return ApiProblems.Validation(new Dictionary<string, string[]> { ["file"] = ["media_form_required"] });
        var form = await request.ReadFormAsync(cancellationToken);
        var result = await mediaService.UploadAsync(access, form["altText"].FirstOrDefault(), form.Files.GetFile("file"), cancellationToken);
        if (result.Value is not null) return TypedResults.Created($"/api/v1/admin/media-assets/{result.Value.Id}", result.Value);
        return result.Failure?.Errors is not null
            ? ApiProblems.Validation(result.Failure.Errors)
            : ApiProblems.Problem(result.Failure?.Status ?? 500, result.Failure?.Code ?? "unexpected_error", result.Failure?.Title ?? "Unexpected error");
    }

    private static async Task<IResult> UpdateMediaAltTextAsync(
        Guid id,
        UpdateMediaAltTextRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = RestaurantValidation.ValidateAltText(request?.AltText);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await MutateAsync(principal, httpRequest, response, ownerContext, service,
            (access, etag) => service.UpdateMediaAltTextAsync(access, id, etag, request!, cancellationToken), cancellationToken);
    }

    private static async Task<IResult> PreviewAsync(
        ClaimsPrincipal principal,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        if (access is null) return TypedResults.Forbid();
        response.Headers.CacheControl = "private, no-store";
        response.Headers["X-Robots-Tag"] = "noindex, nofollow, noarchive";
        response.Headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
        return ToHttpResult(await service.PreviewAsync(access, cancellationToken));
    }

    private static async Task<IResult> ReadSpecialHoursAsync(
        DateOnly? from,
        DateOnly? to,
        ClaimsPrincipal principal,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        if (access is null) return TypedResults.Forbid();
        if (from is not null && to is not null &&
            (from.Value > to.Value || to.Value.DayNumber - from.Value.DayNumber > 730))
        {
            return ApiProblems.Validation(new Dictionary<string, string[]>
            {
                ["range"] = ["special_date_range_invalid"]
            });
        }
        var result = await service.ReadAsync(access, cancellationToken);
        return result.Value is null
            ? ToHttpResult(result)
            : TypedResults.Ok(result.Value.SpecialHours.Where(item =>
                (from is null || DateOnly.Parse(item.Date) >= from) &&
                (to is null || DateOnly.Parse(item.Date) <= to)).ToArray());
    }

    private static async Task<IResult> CreateSpecialHoursAsync(
        AdminSpecialHoursRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = RestaurantValidation.ValidateSpecialHours(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await MutateAsync(principal, httpRequest, response, ownerContext, service,
            (access, etag) => service.CreateSpecialHoursAsync(access, etag, request!, cancellationToken), cancellationToken);
    }

    private static async Task<IResult> UpdateSpecialHoursAsync(
        Guid id,
        AdminSpecialHoursRequest? request,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var errors = RestaurantValidation.ValidateSpecialHours(request);
        if (errors.Count != 0) return ApiProblems.Validation(errors);
        return await MutateAsync(principal, httpRequest, response, ownerContext, service,
            (access, etag) => service.UpdateSpecialHoursAsync(access, id, etag, request!, cancellationToken), cancellationToken);
    }

    private static async Task<IResult> DeleteSpecialHoursAsync(
        Guid id,
        ClaimsPrincipal principal,
        HttpRequest httpRequest,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        if (access is null) return TypedResults.Forbid();
        var result = await service.DeleteSpecialHoursAsync(
            access, id, httpRequest.Headers.IfMatch.ToString(), cancellationToken);
        if (result.Value is null) return ToHttpResult(result);
        response.Headers.ETag = result.Value.Restaurant.ETag;
        response.Headers["X-Publication-Operation-Id"] = result.Value.Publication.OperationId;
        return TypedResults.Ok(result.Value);
    }

    private static async Task<IResult> GetPublicationStatusAsync(
        Guid operationId,
        ClaimsPrincipal principal,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        return access is null
            ? TypedResults.Forbid()
            : ToHttpResult(await service.GetPublicationStatusAsync(access, operationId, cancellationToken));
    }

    private static async Task<IResult> RetryPublicationAsync(
        Guid operationId,
        ClaimsPrincipal principal,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        return access is null
            ? TypedResults.Forbid()
            : ToHttpResult(await service.RetryPublicationAsync(access, operationId, cancellationToken));
    }

    private static async Task<IResult> MutateAsync(
        ClaimsPrincipal principal,
        HttpRequest request,
        HttpResponse response,
        IOwnerRestaurantContext ownerContext,
        IRestaurantManagementService service,
        Func<OwnerRestaurantAccess, string?, Task<ManagementResult<AdminMutationResponse>>> mutation,
        CancellationToken cancellationToken)
    {
        var access = await ownerContext.ResolveAsync(principal, cancellationToken);
        if (access is null) return TypedResults.Forbid();
        var result = await mutation(access, request.Headers.IfMatch.ToString());
        if (result.Value is not null)
        {
            response.Headers.ETag = result.Value.Restaurant.ETag;
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
