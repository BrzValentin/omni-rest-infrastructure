using Microsoft.EntityFrameworkCore;
using OmniRest.Api.Data;

namespace OmniRest.Api.Infrastructure;

/// <summary>
/// The current request's restaurant, resolved once and shared by everything downstream (PR-20 Task 3).
/// Business logic asks this instead of resolving a host or reading a membership itself, so a request
/// can never end up acting for two different restaurants.
/// </summary>
public interface IRestaurantContext
{
    /// <summary>The resolved restaurant id, or null before resolution has succeeded.</summary>
    Guid? RestaurantId { get; }

    /// <summary>How the restaurant was identified, for security logging.</summary>
    RestaurantResolutionSource? Source { get; }

    /// <summary>The lightweight resolution projection, available without loading the entity.</summary>
    RestaurantResolution? Resolution { get; }

    /// <summary>
    /// Resolves from the request host, memoizing the result. Repeated calls within a request reuse the
    /// first answer rather than re-querying, so the PR-20 Task 3 "no duplicate resolution" rule holds
    /// even though several handlers and projections all need the restaurant.
    /// </summary>
    Task<RestaurantResolution?> ResolveFromHostAsync(HostString host, CancellationToken cancellationToken);

    /// <summary>
    /// Binds the context to a restaurant already established by authorization rather than by host —
    /// the owner-portal path, where the tenant comes from the caller's membership.
    /// </summary>
    void BindResolved(Guid restaurantId);

    /// <summary>
    /// Loads the full restaurant entity for the bound restaurant, memoized per request. Returns null
    /// when nothing is bound or the row is gone.
    /// </summary>
    Task<RestaurantEntity?> GetRestaurantAsync(CancellationToken cancellationToken);
}

/// <inheritdoc cref="IRestaurantContext"/>
public sealed class RestaurantContext(
    IRestaurantResolver resolver,
    ITenantScope tenantScope,
    MenuDbContext dbContext) : IRestaurantContext
{
    private RestaurantResolution? resolution;
    private bool hostResolutionAttempted;
    private RestaurantEntity? restaurant;
    private bool restaurantLoaded;

    public Guid? RestaurantId => tenantScope.RestaurantId;

    public RestaurantResolutionSource? Source => resolution?.Source;

    public RestaurantResolution? Resolution => resolution;

    public async Task<RestaurantResolution?> ResolveFromHostAsync(HostString host, CancellationToken cancellationToken)
    {
        if (hostResolutionAttempted)
        {
            return resolution;
        }

        hostResolutionAttempted = true;
        resolution = await resolver.ResolveAsync(host, cancellationToken);
        if (resolution is not null)
        {
            tenantScope.Bind(resolution.Id);
        }

        return resolution;
    }

    public void BindResolved(Guid restaurantId) => tenantScope.Bind(restaurantId);

    public async Task<RestaurantEntity?> GetRestaurantAsync(CancellationToken cancellationToken)
    {
        if (restaurantLoaded)
        {
            return restaurant;
        }

        if (tenantScope.RestaurantId is not { } restaurantId)
        {
            return null;
        }

        restaurantLoaded = true;

        // The tenant filter already constrains this to the bound restaurant; the explicit predicate
        // keeps the query correct even if the filter is ever suppressed around this call.
        restaurant = await dbContext.Restaurants.AsNoTracking()
            .Include(item => item.Settings)
            .SingleOrDefaultAsync(item => item.Id == restaurantId, cancellationToken);
        return restaurant;
    }
}
