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
    AdminAddressRequest Address);

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
public sealed record UpdateMediaAltTextRequest(string AltText);

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
public sealed record PublicationStatusResponse(
    string OperationId,
    string Status,
    string DraftVersion,
    int AttemptCount,
    string? ErrorCode,
    DateTimeOffset UpdatedAt);

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
    string DraftVersion,
    string ETag,
    PublicationStatusResponse? PublicationStatus);

public sealed record AdminMutationResponse(AdminRestaurantResponse Restaurant, PublicationStatusResponse Publication);

public static class DraftETag
{
    public static string Create(Guid restaurantId, long version) => $"\"draft-{restaurantId:N}-{version}\"";

    public static bool Matches(string? header, Guid restaurantId, long version) =>
        header?.Split(',', StringSplitOptions.TrimEntries).Any(value =>
            string.Equals(value, Create(restaurantId, version), StringComparison.Ordinal)) == true;
}
