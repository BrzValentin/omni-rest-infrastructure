using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Tests.Unit;

public sealed class RestaurantValidationTests
{
    [Fact]
    public void ProfileValidationAcceptsE164AndPairedCoordinates()
    {
        var request = ValidProfile();
        Assert.Empty(RestaurantValidation.ValidateProfile(request));

        var invalid = request with
        {
            PhoneE164 = "204-555-0123",
            Address = request.Address with { Longitude = null }
        };
        var errors = RestaurantValidation.ValidateProfile(invalid);
        Assert.Contains("phoneE164", errors.Keys);
        Assert.Contains("address.coordinates", errors.Keys);
    }

    [Fact]
    public void HoursAllowSplitAndOvernightButRejectOverlap()
    {
        Assert.Empty(RestaurantValidation.ValidateRegularHours(new UpdateRegularHoursRequest(new[]
        {
            new AdminRegularHoursDayRequest(1, new[]
            {
                new AdminHourIntervalRequest("11:00", "14:00"),
                new AdminHourIntervalRequest("17:00", "01:00")
            })
        })));

        var errors = RestaurantValidation.ValidateRegularHours(new UpdateRegularHoursRequest(new[]
        {
            new AdminRegularHoursDayRequest(1, new[]
            {
                new AdminHourIntervalRequest("11:00", "18:00"),
                new AdminHourIntervalRequest("17:00", "20:00")
            })
        }));
        Assert.Contains("hours_intervals_overlap", errors["days.1.intervals"]);
    }

    [Theory]
    [InlineData("instagram", "https://www.instagram.com/prairie_table", true)]
    [InlineData("instagram", "https://evil.example/prairie_table", false)]
    [InlineData("facebook", "http://facebook.com/prairie", false)]
    [InlineData("unknown", "https://example.test", false)]
    public void SocialValidationEnforcesPlatformHttpsHosts(string platform, string url, bool valid)
    {
        var errors = RestaurantValidation.ValidateSocialLinks(
            new UpdateSocialLinksRequest([new AdminSocialLinkRequest(platform, url)]));
        Assert.Equal(valid, errors.Count == 0);
    }

    [Fact]
    public void SpecialHoursEnforceClosedAndOpenIntervalRules()
    {
        Assert.Empty(RestaurantValidation.ValidateSpecialHours(
            new AdminSpecialHoursRequest("2026-12-25", true, "Christmas", [])));
        Assert.NotEmpty(RestaurantValidation.ValidateSpecialHours(
            new AdminSpecialHoursRequest("2026-12-25", true, null, [new("10:00", "12:00")])));
        Assert.NotEmpty(RestaurantValidation.ValidateSpecialHours(
            new AdminSpecialHoursRequest("not-a-date", false, null, [])));
    }

    [Fact]
    public void NullableRuntimeShapesReturnStableValidationInsteadOfThrowing()
    {
        Assert.Contains("request", RestaurantValidation.ValidateProfile(null).Keys);
        Assert.Contains("address", RestaurantValidation.ValidateProfile(ValidProfile() with { Address = null! }).Keys);
        Assert.Contains("days", RestaurantValidation.ValidateRegularHours(new UpdateRegularHoursRequest(null!)).Keys);
        Assert.Contains("days", RestaurantValidation.ValidateRegularHours(new UpdateRegularHoursRequest([null!])).Keys);
        Assert.Contains("days.1.intervals", RestaurantValidation.ValidateRegularHours(
            new UpdateRegularHoursRequest([new AdminRegularHoursDayRequest(1, null!)])).Keys);
        Assert.Contains("days.1.intervals", RestaurantValidation.ValidateRegularHours(
            new UpdateRegularHoursRequest([new AdminRegularHoursDayRequest(1, [null!])])).Keys);
        Assert.Contains("intervals", RestaurantValidation.ValidateSpecialHours(
            new AdminSpecialHoursRequest("2026-12-25", false, null, null!)).Keys);
        Assert.Contains("intervals", RestaurantValidation.ValidateSpecialHours(
            new AdminSpecialHoursRequest("2026-12-25", false, null, [null!])).Keys);
        Assert.Contains("links", RestaurantValidation.ValidateSocialLinks(new UpdateSocialLinksRequest(null!)).Keys);
        Assert.Contains("links", RestaurantValidation.ValidateSocialLinks(new UpdateSocialLinksRequest([null!])).Keys);
    }

    private static UpdateRestaurantProfileRequest ValidProfile() => new(
        "Prairie Table", "Local food", "+12045550123", "+1 204-555-0123", "hello@example.test",
        "America/Winnipeg", new AdminAddressRequest(
            "1 Main Street", null, "Winnipeg", "MB", "R3C 0V8", "CA", 49.8951m, -97.1384m));
}
