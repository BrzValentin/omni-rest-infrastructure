using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;

namespace OmniRest.Api.Restaurants;

/// <summary>
/// The single place the owner portal learns which host its restaurant's public menu is served on
/// (PR-26). There is deliberately no restaurant id parameter: the tenant comes from
/// <see cref="IRestaurantContext.RestaurantId"/>, which the owner pipeline has already bound from the
/// caller's membership, so no call site is in a position to ask about somebody else's restaurant.
/// </summary>
public interface IRestaurantPublicAddressService
{
    /// <summary>
    /// Resolves the public address of the restaurant the request is acting for, or <c>null</c> when no
    /// restaurant is bound or its row is gone. A bound restaurant that simply has no reachable host
    /// comes back as <see cref="RestaurantPublicAddressSource.None"/>, which is a different answer from
    /// <c>null</c> and must stay that way: one is "nothing to show yet", the other is "no such tenant".
    /// </summary>
    Task<RestaurantPublicAddress?> GetCurrentAsync(CancellationToken cancellationToken);
}

/// <inheritdoc cref="IRestaurantPublicAddressService"/>
public sealed class RestaurantPublicAddressService(
    MenuDbContext dbContext,
    IRestaurantContext restaurantContext,
    IOptions<PublicMenuOptions> options) : IRestaurantPublicAddressService
{
    public async Task<RestaurantPublicAddress?> GetCurrentAsync(CancellationToken cancellationToken)
    {
        if (restaurantContext.RestaurantId is not { } restaurantId)
        {
            return null;
        }

        // The tenant query filter already constrains this read to the bound restaurant; the explicit
        // predicate is kept so the query still reads correctly on its own terms.
        var row = await dbContext.Restaurants.AsNoTracking()
            .Where(item => item.Id == restaurantId)
            .Select(item => new
            {
                item.Slug,
                Hosts = item.Domains.Select(domain => domain.Host).ToList()
            })
            .SingleOrDefaultAsync(cancellationToken);

        // The same base-domain list RestaurantResolver matches request hosts against, so the address
        // printed on a QR code is always one this deployment would resolve back to this tenant.
        return row is null
            ? null
            : RestaurantPublicAddresses.Resolve(row.Hosts, row.Slug, options.Value.PlatformBaseDomains);
    }
}
