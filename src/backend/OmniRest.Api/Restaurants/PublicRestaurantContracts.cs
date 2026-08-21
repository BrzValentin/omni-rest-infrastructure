using System.Globalization;
using OmniRest.Api.Data;
using OmniRest.Api.Menus;
using Microsoft.Extensions.Options;

namespace OmniRest.Api.Restaurants;

public sealed record PublicPhone(string E164, string Display);

public sealed record PublicAddress(
    string StreetLine1,
    string? StreetLine2,
    string City,
    string Region,
    string PostalCode,
    string CountryCode,
    string Formatted,
    decimal? Latitude,
    decimal? Longitude,
    string DirectionsUrl);

public sealed record PublicHourInterval(string OpensAt, string ClosesAt, bool ClosesNextDay);
public sealed record PublicRegularHours(int DayOfWeek, IReadOnlyList<PublicHourInterval> Intervals);
public sealed record PublicSpecialHours(
    string Date,
    bool IsClosed,
    string? Note,
    IReadOnlyList<PublicHourInterval> Intervals);
public sealed record PublicRestaurantStatus(string State, string Label, DateTimeOffset? NextChangeAt, string Source);
public sealed record PublicSocialLink(string Platform, string Url);

public sealed record PublicRestaurantResponse(
    string Id,
    string Name,
    string? ShortDescription,
    PublicPhone? Phone,
    string? Email,
    string TimeZone,
    PublicAddress? Address,
    IReadOnlyList<PublicRegularHours> RegularHours,
    IReadOnlyList<PublicSpecialHours> SpecialHours,
    PublicRestaurantStatus Status,
    IReadOnlyList<PublicSocialLink> SocialLinks,
    PublicMedia? MainImage,
    string PublicationVersion,
    string? WebsiteDesignId = null);

public sealed class RestaurantPublicProjectionBuilder(
    TimeProvider timeProvider,
    RestaurantStatusCalculator statusCalculator,
    IOptions<PublicMenuOptions> options)
{
    public PublicRestaurantResponse Build(RestaurantEntity restaurant, long version, string websiteDesignId)
    {
        var regular = Enumerable.Range(0, 7)
            .Select(day => new PublicRegularHours(
                day,
                restaurant.RegularHours.Where(item => item.DayOfWeek == day)
                    .OrderBy(item => item.DisplayOrder).ThenBy(item => item.Id)
                    .Select(ToPublicInterval).ToArray()))
            .ToArray();
        var special = restaurant.SpecialHours
            .OrderBy(item => item.Date).ThenBy(item => item.Id)
            .Select(item => new PublicSpecialHours(
                item.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                item.IsClosed,
                item.Note,
                item.Intervals.OrderBy(interval => interval.DisplayOrder).ThenBy(interval => interval.Id)
                    .Select(ToPublicInterval).ToArray()))
            .ToArray();

        PublicMedia? mainImage = null;
        if (restaurant.MainMediaAsset is { ProcessingStatus: "ready" } asset)
        {
            if (asset.Variants.Any(item => item.RestaurantId != restaurant.Id || item.MediaAssetId != asset.Id ||
                item.Width <= 0 || item.Height <= 0 || !MenuValidation.IsSafeMediaUrl(item.Url, options.Value.AllowedMediaHosts)))
            {
                throw new InvalidOperationException("Main image variants are invalid for public projection.");
            }
            mainImage = new PublicMedia(
                asset.AltText,
                asset.Variants.OrderBy(item => item.Width).ThenBy(item => item.Height).ThenBy(item => item.Id)
                    .Select(item => new PublicMediaVariant(item.Url, item.Width, item.Height)).ToArray());
        }

        var address = restaurant.Address is null ? null : ToPublicAddress(restaurant.Address);
        var response = new PublicRestaurantResponse(
            restaurant.Id.ToString(),
            restaurant.Name,
            restaurant.Description,
            restaurant.PhoneE164 is null || restaurant.PhoneDisplay is null
                ? null
                : new PublicPhone(restaurant.PhoneE164, restaurant.PhoneDisplay),
            restaurant.Email,
            restaurant.Settings.TimeZoneId,
            address,
            regular,
            special,
            new PublicRestaurantStatus("closed", "Closed", null, "regularHours"),
            restaurant.SocialLinks.OrderBy(item => item.Platform, StringComparer.Ordinal)
                .Select(item => new PublicSocialLink(item.Platform, item.Url)).ToArray(),
            mainImage,
            version.ToString(CultureInfo.InvariantCulture),
            websiteDesignId);
        return response with { Status = statusCalculator.Calculate(response, timeProvider.GetUtcNow()) };
    }

    private static PublicHourInterval ToPublicInterval(RegularHourIntervalEntity item) => new(
        item.OpensAt.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
        item.ClosesAt.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
        item.ClosesAt <= item.OpensAt);

    private static PublicHourInterval ToPublicInterval(SpecialHourIntervalEntity item) => new(
        item.OpensAt.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
        item.ClosesAt.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
        item.ClosesAt <= item.OpensAt);

    private static PublicAddress ToPublicAddress(RestaurantAddressEntity address)
    {
        var parts = new[] { address.Line1, address.Line2, address.City, address.Region, address.PostalCode, address.CountryCode }
            .Where(value => !string.IsNullOrWhiteSpace(value));
        var formatted = string.Join(", ", parts);
        var destination = address.Latitude is not null
            ? $"{address.Latitude.Value.ToString(CultureInfo.InvariantCulture)},{address.Longitude!.Value.ToString(CultureInfo.InvariantCulture)}"
            : formatted;
        return new PublicAddress(
            address.Line1, address.Line2, address.City, address.Region, address.PostalCode, address.CountryCode,
            formatted, address.Latitude, address.Longitude,
            $"https://www.google.com/maps/dir/?api=1&destination={Uri.EscapeDataString(destination)}");
    }
}

public sealed class RestaurantStatusCalculator
{
    public PublicRestaurantStatus Calculate(PublicRestaurantResponse restaurant, DateTimeOffset now)
    {
        TimeZoneInfo timeZone;
        try
        {
            timeZone = TimeZoneInfo.FindSystemTimeZoneById(restaurant.TimeZone);
        }
        catch (TimeZoneNotFoundException)
        {
            return new PublicRestaurantStatus("closed", "Closed", null, "regularHours");
        }

        var localNow = TimeZoneInfo.ConvertTime(now, timeZone);
        var localDate = DateOnly.FromDateTime(localNow.DateTime);
        var localTime = TimeOnly.FromDateTime(localNow.DateTime);
        var special = restaurant.SpecialHours.FirstOrDefault(
            item => item.Date == localDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        if (special is not null)
        {
            var currentStatus = CalculateForCurrentDay(
                special.IsClosed ? [] : special.Intervals,
                localDate,
                localTime,
                timeZone,
                "specialHours");
            return currentStatus.NextChangeAt is not null
                ? currentStatus
                : FindNextOpening(restaurant, localDate, timeZone) ?? currentStatus;
        }

        var previousDate = localDate.AddDays(-1);
        var previousSpecial = restaurant.SpecialHours.FirstOrDefault(item => item.Date == previousDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
        var previousIntervals = previousSpecial is null
            ? restaurant.RegularHours.FirstOrDefault(item => item.DayOfWeek == (int)previousDate.DayOfWeek)?.Intervals ?? []
            : previousSpecial.IsClosed ? [] : previousSpecial.Intervals;
        var continuation = CalculatePreviousDayContinuation(
            previousIntervals, localDate, localTime, timeZone, previousSpecial is null ? "regularHours" : "specialHours");
        if (continuation is not null)
        {
            return continuation;
        }

        var intervals = restaurant.RegularHours.FirstOrDefault(item => item.DayOfWeek == (int)localDate.DayOfWeek)?.Intervals ?? [];
        var status = CalculateForCurrentDay(intervals, localDate, localTime, timeZone, "regularHours");
        return status.NextChangeAt is not null
            ? status
            : FindNextOpening(restaurant, localDate, timeZone) ?? status;
    }

    private static PublicRestaurantStatus? CalculatePreviousDayContinuation(
        IReadOnlyList<PublicHourInterval> intervals,
        DateOnly currentDate,
        TimeOnly currentTime,
        TimeZoneInfo timeZone,
        string source)
    {
        foreach (var interval in intervals.Where(item => item.ClosesNextDay))
        {
            var closes = TimeOnly.ParseExact(interval.ClosesAt, "HH:mm:ss", CultureInfo.InvariantCulture);
            if (currentTime < closes)
            {
                return new PublicRestaurantStatus(
                    "open", $"Closes at {closes:HH\\:mm}", ToUtc(currentDate, closes, timeZone), source);
            }
        }
        return null;
    }

    private static PublicRestaurantStatus CalculateForCurrentDay(
        IReadOnlyList<PublicHourInterval> intervals,
        DateOnly date,
        TimeOnly time,
        TimeZoneInfo timeZone,
        string source)
    {
        foreach (var interval in intervals)
        {
            var opens = TimeOnly.ParseExact(interval.OpensAt, "HH:mm:ss", CultureInfo.InvariantCulture);
            var closes = TimeOnly.ParseExact(interval.ClosesAt, "HH:mm:ss", CultureInfo.InvariantCulture);
            var isOpen = time >= opens && (interval.ClosesNextDay || time < closes);
            if (isOpen)
            {
                var closeDate = interval.ClosesNextDay ? date.AddDays(1) : date;
                return new PublicRestaurantStatus(
                    "open", $"Closes at {closes:HH\\:mm}", ToUtc(closeDate, closes, timeZone), source);
            }

            if (time < opens)
            {
                return new PublicRestaurantStatus(
                    "closed", $"Opens at {opens:HH\\:mm}", ToUtc(date, opens, timeZone), source);
            }
        }

        return new PublicRestaurantStatus("closed", "Closed", null, source);
    }

    private static PublicRestaurantStatus? FindNextOpening(
        PublicRestaurantResponse restaurant,
        DateOnly localDate,
        TimeZoneInfo timeZone)
    {
        for (var daysAhead = 1; daysAhead <= 7; daysAhead++)
        {
            var date = localDate.AddDays(daysAhead);
            var dateText = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var special = restaurant.SpecialHours.FirstOrDefault(item => item.Date == dateText);
            var source = special is null ? "regularHours" : "specialHours";
            var intervals = special is null
                ? restaurant.RegularHours.FirstOrDefault(item => item.DayOfWeek == (int)date.DayOfWeek)?.Intervals ?? []
                : special.IsClosed ? [] : special.Intervals;
            var firstInterval = intervals.OrderBy(item => item.OpensAt, StringComparer.Ordinal).FirstOrDefault();
            if (firstInterval is null)
            {
                continue;
            }

            var opens = TimeOnly.ParseExact(firstInterval.OpensAt, "HH:mm:ss", CultureInfo.InvariantCulture);
            return new PublicRestaurantStatus(
                "closed", $"Opens at {opens:HH\\:mm}", ToUtc(date, opens, timeZone), source);
        }

        return null;
    }

    private static DateTimeOffset ToUtc(DateOnly date, TimeOnly time, TimeZoneInfo timeZone)
    {
        var local = date.ToDateTime(time, DateTimeKind.Unspecified);
        return new DateTimeOffset(local, timeZone.GetUtcOffset(local)).ToUniversalTime();
    }
}
