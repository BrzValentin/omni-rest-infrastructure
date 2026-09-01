using Microsoft.EntityFrameworkCore;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;

namespace OmniRest.Api.Security;

/// <summary>
/// The single authority on "may this user act for this restaurant?" (PR-21 Task 4).
/// </summary>
/// <remarks>
/// Ownership used to be re-expressed as an inline membership predicate everywhere it was needed, which
/// is how one call site ends up with a subtly weaker rule than the rest. Every caller that has a
/// concrete restaurant id in hand asks this instead, so tightening the rule is a one-file change.
/// The method carries the <c>Async</c> suffix the rest of the codebase uses; it is the spec's
/// <c>CanAccessRestaurant(userId, restaurantId)</c>.
/// </remarks>
public interface IRestaurantAccessGuard
{
    /// <summary>
    /// True when <paramref name="userId"/> holds an active owner membership for
    /// <paramref name="restaurantId"/>. A false answer is logged as an ownership violation before it is
    /// returned, so a caller cannot deny access without leaving an audit trail (PR-21 Task 10).
    /// </summary>
    Task<bool> CanAccessRestaurantAsync(Guid userId, Guid restaurantId, CancellationToken cancellationToken);
}

/// <summary>
/// Reads one membership row. Split out from <see cref="RestaurantAccessGuard"/> so the guard's tenant
/// handling can be exercised without a database, and so the EF query for "is this an active owner
/// membership" exists in exactly one expression.
/// </summary>
public interface IOwnerMembershipLookup
{
    Task<bool> HasActiveOwnerMembershipAsync(Guid userId, Guid restaurantId, CancellationToken cancellationToken);
}

/// <inheritdoc cref="IOwnerMembershipLookup"/>
public sealed class OwnerMembershipLookup(MenuDbContext dbContext) : IOwnerMembershipLookup
{
    public Task<bool> HasActiveOwnerMembershipAsync(Guid userId, Guid restaurantId, CancellationToken cancellationToken) =>
        dbContext.RestaurantMemberships.AsNoTracking().AnyAsync(
            item => item.UserId == userId &&
                item.RestaurantId == restaurantId &&
                item.Status == MembershipStatuses.Active &&
                item.Role == MembershipRoles.Owner,
            cancellationToken);
}

/// <inheritdoc cref="IRestaurantAccessGuard"/>
public sealed class RestaurantAccessGuard(
    IOwnerMembershipLookup membershipLookup,
    ITenantScope tenantScope,
    ISecurityAuditLog auditLog) : IRestaurantAccessGuard
{
    public async Task<bool> CanAccessRestaurantAsync(Guid userId, Guid restaurantId, CancellationToken cancellationToken)
    {
        // The empty GUID is never a real principal or restaurant, and letting it reach the query would
        // turn a malformed request into a database round trip.
        if (userId == Guid.Empty || restaurantId == Guid.Empty)
        {
            return false;
        }

        var boundRestaurantId = tenantScope.RestaurantId;
        bool permitted;

        // RestaurantMembershipEntity carries the tenant query filter, so once the request is bound the
        // filter hides every membership row that does not belong to the bound restaurant — including the
        // exact row this check exists to find. Without the suppression the guard would silently answer
        // "no" for every restaurant except the one already assumed, which is the same answer whether the
        // user owns the requested restaurant or not, and the question would be meaningless. Suppressing
        // is safe here because nothing crosses the boundary: the lookup projects a single row down to a
        // bool, so no other tenant's data can escape this method.
        using (tenantScope.Suppress())
        {
            permitted = await membershipLookup.HasActiveOwnerMembershipAsync(userId, restaurantId, cancellationToken);
        }

        if (!permitted)
        {
            auditLog.OwnershipViolation(userId, restaurantId, boundRestaurantId, "restaurant_not_owned");
        }

        return permitted;
    }
}
