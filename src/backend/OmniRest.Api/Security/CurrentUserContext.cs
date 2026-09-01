using System.Security.Claims;

namespace OmniRest.Api.Security;

/// <summary>
/// Who the current request is acting as (PR-21 Task 2): the authenticated user, the role they hold, and
/// the restaurant they manage.
/// </summary>
/// <remarks>
/// Every member is safe for an anonymous request and returns <c>null</c> rather than throwing, so a
/// handler can ask these questions before it knows whether anyone is signed in.
/// <para>
/// The restaurant is not re-queried here. <see cref="ActiveOwnerHandler"/> resolves it through
/// <see cref="IOwnerRestaurantContext"/> while the authorization policy runs, which both binds the
/// tenant scope and memoizes the answer; this type reads that memoized answer. That is why the accessors
/// are synchronous, and it is what keeps PR-20 Task 3's "resolve the restaurant exactly once per
/// request" rule true. A request that never ran the restaurant-owner policy has no owner restaurant to
/// report and correctly answers <c>null</c>.
/// </para>
/// </remarks>
public interface ICurrentUserContext
{
    /// <summary>The signed-in user's id, or null when the request is anonymous.</summary>
    Guid? GetUserId();

    /// <summary>
    /// The role the caller acts with: <see cref="PlatformRoles.PlatformAdmin"/> when the principal
    /// carries that Identity role, otherwise the membership role established by the owner policy.
    /// Null when the request is anonymous or no membership has been resolved.
    /// </summary>
    string? GetRole();

    /// <summary>The restaurant the signed-in user manages, or null when there is none.</summary>
    Guid? GetRestaurantId();
}

/// <inheritdoc cref="ICurrentUserContext"/>
public sealed class CurrentUserContext(
    IHttpContextAccessor httpContextAccessor,
    IOwnerRestaurantContext ownerContext) : ICurrentUserContext
{
    public Guid? GetUserId()
    {
        if (AuthenticatedPrincipal() is not { } principal)
        {
            return null;
        }

        // A malformed or absent subject claim is treated exactly like an anonymous caller: the contract
        // is "null, never throw", and a principal we cannot identify is one we must not trust.
        return Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) && userId != Guid.Empty
            ? userId
            : null;
    }

    public string? GetRole()
    {
        if (AuthenticatedPrincipal() is not { } principal)
        {
            return null;
        }

        return principal.IsInRole(PlatformRoles.PlatformAdmin)
            ? PlatformRoles.PlatformAdmin
            : ownerContext.Resolved?.Role;
    }

    public Guid? GetRestaurantId() => GetUserId() is null ? null : ownerContext.Resolved?.RestaurantId;

    private ClaimsPrincipal? AuthenticatedPrincipal()
    {
        var principal = httpContextAccessor.HttpContext?.User;
        return principal?.Identity?.IsAuthenticated == true ? principal : null;
    }
}
