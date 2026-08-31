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

public sealed record PublicGalleryImage(
    string Id,
    string ImageUrl,
    string ThumbnailUrl,
    string AltText,
    string? Caption,
    int Width,
    int Height,
    int ThumbnailWidth,
    int ThumbnailHeight);

public sealed record PublicGalleryResponse(
    string PublicationVersion,
    IReadOnlyList<PublicGalleryImage> Images);

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
    IReadOnlyList<PublicGalleryImage> Gallery,
    string? WebsiteDesignId = null,

    /// <summary>Schema.org FoodEstablishment subtype used verbatim as the JSON-LD <c>@type</c>.</summary>
    string? RestaurantType = null,

    /// <summary>Schema.org <c>priceRange</c> band, one of <c>$</c> through <c>$$$$</c>.</summary>
    string? PriceRange = null,
    PublicMedia? Logo = null,
    PublicMedia? CoverImage = null,

    /// <summary>
    /// When the current publication row was written; supplied by <c>PublicMenuReader</c> from
    /// <c>publications.published_at</c> rather than from the snapshot. Null before first publication.
    /// </summary>
    DateTimeOffset? PublishedAt = null);

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

        var mainImage = BuildRestaurantMedia(restaurant.Id, restaurant.MainMediaAsset, "Main image");
        var logo = BuildRestaurantMedia(restaurant.Id, restaurant.LogoMediaAsset, "Logo");
        var coverImage = BuildRestaurantMedia(restaurant.Id, restaurant.CoverMediaAsset, "Cover image");

        var gallery = restaurant.GalleryImages
            .Where(item => item.IsActive)
            .OrderBy(item => item.DisplayOrder)
            .ThenBy(item => item.Id)
            .Select(item => BuildGalleryImage(restaurant.Id, item))
            .OfType<PublicGalleryImage>()
            .ToArray();

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
            gallery,
            websiteDesignId,
            restaurant.RestaurantType,
            restaurant.PriceRange,
            logo,
            coverImage);
        return response with { Status = statusCalculator.Calculate(response, timeProvider.GetUtcNow()) };
    }

    /// <summary>
    /// Projects one restaurant-level image slot (main, logo, or cover), or <c>null</c> when the slot is
    /// empty or its asset is not publishable. An asset that is not ready is skipped rather than published
    /// with a URL that would 404; a variant that fails the allow-list is a data defect and throws.
    /// </summary>
    private PublicMedia? BuildRestaurantMedia(Guid restaurantId, MediaAssetEntity? asset, string slotName)
    {
        if (asset is not { ProcessingStatus: "ready" })
        {
            return null;
        }

        if (asset.Variants.Any(item => item.RestaurantId != restaurantId || item.MediaAssetId != asset.Id ||
            item.Width <= 0 || item.Height <= 0 ||
            !MenuValidation.IsSafeMediaUrl(item.Url, options.Value.AllowedMediaHosts)))
        {
            throw new InvalidOperationException($"{slotName} variants are invalid for public projection.");
        }

        return new PublicMedia(
            asset.AltText,
            asset.Variants.OrderBy(item => item.Width).ThenBy(item => item.Height).ThenBy(item => item.Id)
                .Select(item => new PublicMediaVariant(item.Url, item.Width, item.Height)).ToArray());
    }

    /// <summary>
    /// Projects one active gallery row, or <c>null</c> when the asset is not publishable. An asset that is
    /// not ready, or that has no variants, is skipped rather than published with a broken URL.
    /// </summary>
    private PublicGalleryImage? BuildGalleryImage(Guid restaurantId, GalleryImageEntity image)
    {
        if (image.RestaurantId != restaurantId || image.MediaAsset.RestaurantId != restaurantId ||
            image.MediaAsset.Id != image.MediaAssetId)
        {
            throw new InvalidOperationException("Gallery ownership does not match the published restaurant.");
        }

        if (image.MediaAsset.ProcessingStatus != "ready" || image.MediaAsset.Variants.Count == 0)
        {
            return null;
        }

        var variants = image.MediaAsset.Variants
            .OrderBy(item => item.Width).ThenBy(item => item.Height).ThenBy(item => item.Id)
            .ToArray();
        if (variants.Any(item => item.RestaurantId != restaurantId || item.MediaAssetId != image.MediaAssetId ||
            item.Width <= 0 || item.Height <= 0 ||
            !MenuValidation.IsSafeMediaUrl(item.Url, options.Value.AllowedMediaHosts)))
        {
            throw new InvalidOperationException("Gallery image variants are invalid for public projection.");
        }

        // Smallest width is the thumbnail, largest is the full-size image; a single variant serves both.
        var thumbnail = variants[0];
        var original = variants[^1];
        return new PublicGalleryImage(
            image.Id.ToString("D", CultureInfo.InvariantCulture),
            original.Url,
            thumbnail.Url,
            image.MediaAsset.AltText,
            image.Caption,
            original.Width,
            original.Height,
            thumbnail.Width,
            thumbnail.Height);
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
