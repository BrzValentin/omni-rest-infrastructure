using OmniRest.Api.Menus;

namespace OmniRest.Api.Restaurants;

public sealed record AdminAddressRequest(
    string Line1,
    string? Line2,
    string City,
    string Region,
    string PostalCode,
    string CountryCode,
    decimal? Latitude,
    decimal? Longitude);

public sealed record UpdateRestaurantProfileRequest(
    string Name,
    string? Description,
    string? PhoneE164,
    string? PhoneDisplay,
    string? Email,
    string TimeZone,
    AdminAddressRequest Address,

    /// <summary>Schema.org FoodEstablishment subtype; see <see cref="Data.RestaurantTypes"/>.</summary>
    string? RestaurantType = null,

    /// <summary>Schema.org price band; see <see cref="Data.PriceRanges"/>.</summary>
    string? PriceRange = null,

    /// <summary>
    /// The restaurant's own site. Null or empty clears it; otherwise an absolute https URL of at most
    /// 2048 characters (PR-24). Trailing position keeps every existing positional construction valid.
    /// </summary>
    string? WebsiteUrl = null,

    /// <summary>
    /// BUG-001: the longer "About Us" copy. Trimmed; null, empty or whitespace clears it; at most 2000
    /// characters after trimming, line breaks allowed. Like <see cref="WebsiteUrl"/>, the profile PUT is a full
    /// replacement, so a client that omits the field clears a stored value.
    /// </summary>
    string? About = null);

public sealed record AdminHourIntervalRequest(string OpensAt, string ClosesAt);
public sealed record AdminRegularHoursDayRequest(int DayOfWeek, IReadOnlyList<AdminHourIntervalRequest> Intervals);
public sealed record UpdateRegularHoursRequest(IReadOnlyList<AdminRegularHoursDayRequest> Days);
public sealed record AdminSpecialHoursRequest(
    string Date,
    bool IsClosed,
    string? Note,
    IReadOnlyList<AdminHourIntervalRequest> Intervals);
public sealed record AdminSocialLinkRequest(string Platform, string Url);
public sealed record UpdateSocialLinksRequest(IReadOnlyList<AdminSocialLinkRequest> Links);
public sealed record SelectMainImageRequest(Guid? MediaAssetId);
public sealed record SelectLogoRequest(Guid? MediaAssetId);
public sealed record SelectCoverImageRequest(Guid? MediaAssetId);
public sealed record UpdateMediaAltTextRequest(string AltText);
public sealed record UpdateWebsiteDesignRequest(string DesignId);

public sealed record AdminAddressResponse(
    string Line1,
    string? Line2,
    string City,
    string Region,
    string PostalCode,
    string CountryCode,
    decimal? Latitude,
    decimal? Longitude);
public sealed record AdminHourIntervalResponse(string OpensAt, string ClosesAt, bool ClosesNextDay);
public sealed record AdminRegularHoursDayResponse(int DayOfWeek, IReadOnlyList<AdminHourIntervalResponse> Intervals);
public sealed record AdminSpecialHoursResponse(
    string Id,
    string Date,
    bool IsClosed,
    string? Note,
    IReadOnlyList<AdminHourIntervalResponse> Intervals);
public sealed record AdminSocialLinkResponse(string Platform, string Url);
public sealed record AdminMainImageResponse(string Id, string AltText, string ProcessingStatus, IReadOnlyList<PublicMediaVariant> Variants);
public sealed record AdminMediaAssetResponse(string Id, string AltText, string ProcessingStatus, IReadOnlyList<PublicMediaVariant> Variants);
public sealed record AdminWebsiteDesignResponse(
    string Id,
    string Name,
    string ContractVersion,
    string Availability);
public sealed record PublicationStatusResponse(
    string OperationId,
    string Status,
    string DraftVersion,
    int AttemptCount,
    string? ErrorCode,
    DateTimeOffset UpdatedAt);

/// <summary>
/// The host the tenant's public menu is served on, so the dashboard can build a QR target it cannot
/// derive from its own request host — the owner portal may be served on a different host entirely
/// (PR-26). <c>Host</c> is null exactly when <c>Source</c> is <c>"none"</c>, meaning the tenant has no
/// custom domain and the deployment configures no platform base domain to place its slug beneath.
/// </summary>
/// <param name="Host">The public host, lowercase and without a scheme, or null when there is none.</param>
/// <param name="Source">How the host was arrived at: <c>"domain"</c>, <c>"slug"</c> or <c>"none"</c>.</param>
public sealed record AdminPublicAddressResponse(string? Host, string Source);

public sealed record AdminRestaurantResponse(
    string Id,
    string Name,
    string? Description,
    string? PhoneE164,
    string? PhoneDisplay,
    string? Email,
    string TimeZone,
    AdminAddressResponse? Address,
    IReadOnlyList<AdminRegularHoursDayResponse> RegularHours,
    IReadOnlyList<AdminSpecialHoursResponse> SpecialHours,
    IReadOnlyList<AdminSocialLinkResponse> SocialLinks,
    AdminMainImageResponse? MainImage,
    string DraftDesignId,
    string PublishedDesignId,
    IReadOnlyList<AdminWebsiteDesignResponse> WebsiteDesigns,
    string DraftVersion,
    string ETag,
    PublicationStatusResponse? PublicationStatus,
    string? RestaurantType = null,
    string? PriceRange = null,
    AdminMainImageResponse? Logo = null,
    AdminMainImageResponse? CoverImage = null,

    /// <summary>The saved website link, so the owner form round-trips what it stored (PR-24).</summary>
    string? WebsiteUrl = null,

    /// <summary>The saved "About Us" copy, so the owner form round-trips what it stored (BUG-001).</summary>
    string? About = null);

public sealed record AdminMutationResponse(AdminRestaurantResponse Restaurant, PublicationStatusResponse Publication);

public static class DraftETag
{
    public static string Create(Guid restaurantId, long version) => $"\"draft-{restaurantId:N}-{version}\"";

    public static bool Matches(string? header, Guid restaurantId, long version) =>
        header?.Split(',', StringSplitOptions.TrimEntries).Any(value =>
            string.Equals(value, Create(restaurantId, version), StringComparison.Ordinal)) == true;
}
