using System.Globalization;
using System.Net.Mail;
using System.Text.RegularExpressions;

namespace OmniRest.Api.Restaurants;

public static partial class RestaurantValidation
{
    private static readonly IReadOnlyDictionary<string, string[]> SocialHosts =
        new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["instagram"] = ["instagram.com", "www.instagram.com"],
            ["facebook"] = ["facebook.com", "www.facebook.com"],
            ["tiktok"] = ["tiktok.com", "www.tiktok.com"],
            ["google_business"] = ["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl"]
        };

    public static IReadOnlyDictionary<string, string[]> ValidateProfile(UpdateRestaurantProfileRequest? request)
    {
        var errors = NewErrors();
        if (request is null) { Add(errors, "request", "request_required"); return ToArrays(errors); }
        ValidateText(errors, "name", request.Name, 1, 120, required: true);
        ValidateText(errors, "description", request.Description, 1, 300, required: false);
        if (request.PhoneE164 is not null && !E164().IsMatch(request.PhoneE164))
        {
            Add(errors, "phoneE164", "phone_e164_invalid");
        }
        if ((request.PhoneE164 is null) != (request.PhoneDisplay is null) || request.PhoneDisplay?.Length > 40)
        {
            Add(errors, "phoneDisplay", "phone_display_invalid");
        }
        if (request.Email is not null && (request.Email.Length > 320 || !MailAddress.TryCreate(request.Email, out _)))
        {
            Add(errors, "email", "email_invalid");
        }
        try
        {
            _ = TimeZoneInfo.FindSystemTimeZoneById(request.TimeZone ?? string.Empty);
        }
        catch (TimeZoneNotFoundException)
        {
            Add(errors, "timeZone", "time_zone_invalid");
        }
        catch (InvalidTimeZoneException)
        {
            Add(errors, "timeZone", "time_zone_invalid");
        }

        ValidateAddress(errors, request.Address);
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateRegularHours(UpdateRegularHoursRequest? request)
    {
        var errors = NewErrors();
        if (request?.Days is null) { Add(errors, "days", "field_required"); return ToArrays(errors); }
        if (request.Days.Count > 7 || request.Days.Any(item => item is null) ||
            request.Days.Where(item => item is not null).Select(item => item!.DayOfWeek).Distinct().Count() != request.Days.Count)
        {
            Add(errors, "days", "hours_days_duplicate");
        }
        foreach (var day in request.Days)
        {
            if (day is null) { Add(errors, "days", "hours_day_invalid"); continue; }
            if (day.DayOfWeek is < 0 or > 6)
            {
                Add(errors, "days", "hours_day_invalid");
                continue;
            }
            ValidateIntervals(errors, $"days.{day.DayOfWeek}.intervals", day.Intervals, requireOne: false);
        }
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateSpecialHours(AdminSpecialHoursRequest? request)
    {
        var errors = NewErrors();
        if (request is null) { Add(errors, "request", "request_required"); return ToArrays(errors); }
        if (!DateOnly.TryParseExact(request.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
        {
            Add(errors, "date", "special_date_invalid");
        }
        ValidateText(errors, "note", request.Note, 1, 200, required: false);
        if (request.Intervals is null)
        {
            Add(errors, "intervals", "field_required");
        }
        else if (request.IsClosed && request.Intervals.Count != 0)
        {
            Add(errors, "intervals", "closed_date_has_intervals");
        }
        else if (!request.IsClosed)
        {
            ValidateIntervals(errors, "intervals", request.Intervals, requireOne: true);
        }
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateSocialLinks(UpdateSocialLinksRequest? request)
    {
        var errors = NewErrors();
        if (request?.Links is null) { Add(errors, "links", "field_required"); return ToArrays(errors); }
        if (request.Links.Count > SocialHosts.Count || request.Links.Any(item => item is null) ||
            request.Links.Where(item => item is not null).Select(item => item!.Platform).Distinct(StringComparer.Ordinal).Count() != request.Links.Count)
        {
            Add(errors, "links", "social_platform_duplicate");
        }
        foreach (var link in request.Links)
        {
            if (link is null) { Add(errors, "links", "social_url_invalid"); continue; }
            if (string.IsNullOrEmpty(link.Platform) || string.IsNullOrEmpty(link.Url) ||
                !SocialHosts.TryGetValue(link.Platform, out var hosts) ||
                link.Url.Length > 2048 || !Uri.TryCreate(link.Url, UriKind.Absolute, out var uri) ||
                uri.Scheme != Uri.UriSchemeHttps || uri.UserInfo.Length != 0 || !uri.IsDefaultPort ||
                !hosts.Contains(uri.IdnHost, StringComparer.OrdinalIgnoreCase))
            {
                Add(errors, $"links.{link.Platform}", "social_url_invalid");
            }
        }
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateAltText(string? altText)
    {
        var errors = NewErrors();
        ValidateText(errors, "altText", altText, 1, 200, required: true);
        return ToArrays(errors);
    }

    private static void ValidateAddress(Dictionary<string, List<string>> errors, AdminAddressRequest? address)
    {
        if (address is null) { Add(errors, "address", "field_required"); return; }
        ValidateText(errors, "address.line1", address.Line1, 1, 160, required: true);
        ValidateText(errors, "address.line2", address.Line2, 1, 160, required: false);
        ValidateText(errors, "address.city", address.City, 1, 100, required: true);
        ValidateText(errors, "address.region", address.Region, 1, 100, required: true);
        ValidateText(errors, "address.postalCode", address.PostalCode, 1, 20, required: true);
        if (address.CountryCode is null || !CountryCode().IsMatch(address.CountryCode))
        {
            Add(errors, "address.countryCode", "country_code_invalid");
        }
        if ((address.Latitude is null) != (address.Longitude is null) ||
            address.Latitude is < -90 or > 90 || address.Longitude is < -180 or > 180)
        {
            Add(errors, "address.coordinates", "coordinates_invalid");
        }
    }

    private static void ValidateIntervals(
        Dictionary<string, List<string>> errors,
        string field,
        IReadOnlyList<AdminHourIntervalRequest>? intervals,
        bool requireOne)
    {
        if (intervals is null)
        {
            Add(errors, field, "field_required");
            return;
        }
        if (requireOne && intervals.Count == 0)
        {
            Add(errors, field, "hours_interval_required");
            return;
        }
        if (intervals.Count > 12)
        {
            Add(errors, field, "hours_interval_limit");
        }

        var ranges = new List<(int Start, int End)>();
        foreach (var interval in intervals)
        {
            if (interval is null || interval.OpensAt is null || interval.ClosesAt is null ||
                !TimeOnly.TryParseExact(interval.OpensAt, ["HH:mm", "HH:mm:ss"], CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var opens) ||
                !TimeOnly.TryParseExact(interval.ClosesAt, ["HH:mm", "HH:mm:ss"], CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var closes) || opens == closes)
            {
                Add(errors, field, "hours_interval_invalid");
                continue;
            }
            var start = opens.Hour * 60 + opens.Minute;
            var end = closes.Hour * 60 + closes.Minute;
            if (end <= start)
            {
                end += 24 * 60;
            }
            ranges.Add((start, end));
        }

        ranges.Sort((left, right) => left.Start.CompareTo(right.Start));
        if (ranges.Zip(ranges.Skip(1)).Any(pair => pair.First.End > pair.Second.Start))
        {
            Add(errors, field, "hours_intervals_overlap");
        }
    }

    private static Dictionary<string, List<string>> NewErrors() => new(StringComparer.Ordinal);

    private static void ValidateText(
        Dictionary<string, List<string>> errors,
        string field,
        string? value,
        int minimum,
        int maximum,
        bool required)
    {
        if (value is null)
        {
            if (required) Add(errors, field, "field_required");
            return;
        }
        var trimmed = value.Trim();
        if (trimmed.Length < minimum || trimmed.Length > maximum || trimmed.Any(char.IsControl))
        {
            Add(errors, field, "field_length_invalid");
        }
    }

    private static void Add(Dictionary<string, List<string>> errors, string field, string code)
    {
        if (!errors.TryGetValue(field, out var values))
        {
            values = [];
            errors[field] = values;
        }
        values.Add(code);
    }

    private static IReadOnlyDictionary<string, string[]> ToArrays(Dictionary<string, List<string>> errors) =>
        errors.ToDictionary(item => item.Key, item => item.Value.ToArray(), StringComparer.Ordinal);

    [GeneratedRegex("^\\+[1-9][0-9]{7,14}$", RegexOptions.CultureInvariant)]
    private static partial Regex E164();

    [GeneratedRegex("^[A-Z]{2}$", RegexOptions.CultureInvariant)]
    private static partial Regex CountryCode();
}
