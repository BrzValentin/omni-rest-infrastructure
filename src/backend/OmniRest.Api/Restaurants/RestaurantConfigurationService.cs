using Microsoft.EntityFrameworkCore;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;

namespace OmniRest.Api.Restaurants;

/// <summary>An image slot in the configuration, resolved to its publishable variants.</summary>
public sealed record RestaurantConfigurationImage(string AltText, string Url, int Width, int Height);

/// <summary>How the public reaches a restaurant.</summary>
public sealed record RestaurantConfigurationContact(
    string? PhoneE164,
    string? PhoneDisplay,
    string? Email);

/// <summary>Where a restaurant is.</summary>
public sealed record RestaurantConfigurationAddress(
    string Line1,
    string? Line2,
    string City,
    string Region,
    string PostalCode,
    string CountryCode,
    decimal? Latitude,
    decimal? Longitude);

/// <summary>A restaurant's presence on one social platform.</summary>
public sealed record RestaurantConfigurationSocialLink(string Platform, string Url);

/// <summary>
/// Everything Phase 7 calls "restaurant configuration" (PR-20 Task 5), gathered into one shape so no
/// caller has to know that it lives across <c>restaurants</c>, <c>restaurant_settings</c>,
/// <c>restaurant_addresses</c>, <c>social_links</c>, and <c>media_assets</c>.
/// </summary>
public sealed record RestaurantConfiguration(
    Guid RestaurantId,
    string Name,
    string? Slug,
    RestaurantConfigurationImage? Logo,
    string TimeZoneId,
    string Currency,
    string Language,
    RestaurantConfigurationContact Contact,
    RestaurantConfigurationAddress? Address,
    IReadOnlyList<RestaurantConfigurationSocialLink> SocialLinks);

/// <summary>
/// The single place restaurant configuration is read from (PR-20 Task 5). Configuration is per-tenant
/// and lives in tables keyed by restaurant, so one restaurant's settings can never overwrite another's;
/// this service exists so that fact is enforced in one implementation rather than restated at each call
/// site.
/// </summary>
public interface IRestaurantConfigurationService
{
    /// <summary>
    /// Reads the configuration for the restaurant the request is acting for, or <c>null</c> when no
    /// restaurant is bound or its row is gone.
    /// </summary>
    Task<RestaurantConfiguration?> GetCurrentAsync(CancellationToken cancellationToken);
}

/// <inheritdoc cref="IRestaurantConfigurationService"/>
public sealed class RestaurantConfigurationService(
    MenuDbContext dbContext,
    IRestaurantContext restaurantContext) : IRestaurantConfigurationService
{
    public async Task<RestaurantConfiguration?> GetCurrentAsync(CancellationToken cancellationToken)
    {
        if (restaurantContext.RestaurantId is not { } restaurantId)
        {
            return null;
        }

        // The tenant query filter already constrains every set touched here to the bound restaurant.
        // The explicit predicate is kept so the query still reads correctly on its own terms.
        var restaurant = await dbContext.Restaurants.AsNoTracking()
            .Include(item => item.Settings)
            .Include(item => item.Address)
            .Include(item => item.SocialLinks)
            .Include(item => item.LogoMediaAsset!).ThenInclude(item => item.Variants)
            .SingleOrDefaultAsync(item => item.Id == restaurantId, cancellationToken);

        return restaurant is null ? null : Project(restaurant);
    }

    private static RestaurantConfiguration Project(RestaurantEntity restaurant) => new(
        restaurant.Id,
        restaurant.Name,
        restaurant.Slug,
        BuildLogo(restaurant.LogoMediaAsset),
        restaurant.Settings.TimeZoneId,
        restaurant.Settings.Currency,
        restaurant.Settings.Locale,
        new RestaurantConfigurationContact(restaurant.PhoneE164, restaurant.PhoneDisplay, restaurant.Email),
        restaurant.Address is { } address
            ? new RestaurantConfigurationAddress(
                address.Line1, address.Line2, address.City, address.Region,
                address.PostalCode, address.CountryCode, address.Latitude, address.Longitude)
            : null,
        [.. restaurant.SocialLinks
            .OrderBy(item => item.Platform, StringComparer.Ordinal)
            .Select(item => new RestaurantConfigurationSocialLink(item.Platform, item.Url))]);

    /// <summary>
    /// Picks the largest ready variant, matching how the public projection orders variants. An asset
    /// that is not ready is reported as no logo rather than as a URL that would 404.
    /// </summary>
    private static RestaurantConfigurationImage? BuildLogo(MediaAssetEntity? asset)
    {
        if (asset is not { ProcessingStatus: "ready" })
        {
            return null;
        }

        var variant = asset.Variants
            .OrderByDescending(item => item.Width).ThenByDescending(item => item.Height).ThenBy(item => item.Id)
            .FirstOrDefault();
        return variant is null
            ? null
            : new RestaurantConfigurationImage(asset.AltText, variant.Url, variant.Width, variant.Height);
    }
}
