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
    [InlineData("x", "https://x.com/prairie_table", true)]
    [InlineData("x", "https://www.x.com/prairie_table", true)]
    [InlineData("x", "https://twitter.com/prairie_table", true)]
    [InlineData("x", "https://www.twitter.com/prairie_table", true)]
    [InlineData("x", "https://x.example/prairie_table", false)]
    [InlineData("x", "http://x.com/prairie_table", false)]
    [InlineData("youtube", "https://youtube.com/@prairietable", true)]
    [InlineData("youtube", "https://www.youtube.com/@prairietable", true)]
    [InlineData("youtube", "https://m.youtube.com/@prairietable", true)]
    [InlineData("youtube", "https://youtu.be/abcdefghijk", true)]
    [InlineData("youtube", "https://youtube.evil.example/@prairietable", false)]
    [InlineData("linkedin", "https://linkedin.com/company/prairie-table", true)]
    [InlineData("linkedin", "https://www.linkedin.com/company/prairie-table", true)]
    [InlineData("linkedin", "https://m.linkedin.com/company/prairie-table", false)]
    // BUG-006: numeric/ID-style profile URLs are valid; only the host is allow-listed, never the path or query.
    [InlineData("facebook", "https://www.facebook.com/profile.php?id=100073564902779", true)]
    [InlineData("facebook", "https://facebook.com/profile.php?id=100073564902779", true)]
    [InlineData("facebook", "http://www.facebook.com/profile.php?id=100073564902779", false)]
    [InlineData("facebook", "https://www.facebook.com.evil.example/profile.php?id=100073564902779", false)]
    [InlineData("instagram", "https://www.instagram.com/p/C8x1Yz2AbCd/", true)]
    [InlineData("tiktok", "https://www.tiktok.com/@prairie_table/video/7234567890123456789", true)]
    [InlineData("google_business", "https://maps.google.com/?cid=12345678901234567890", true)]
    [InlineData("x", "https://x.com/i/user/1234567890", true)]
    [InlineData("youtube", "https://www.youtube.com/channel/UC1234567890abcdefghijkl", true)]
    [InlineData("linkedin", "https://www.linkedin.com/company/12345678", true)]
    // BUG-006: a URL is judged against the platform it was saved under, so a Facebook URL is not an Instagram link.
    [InlineData("instagram", "https://www.facebook.com/profile.php?id=100073564902779", false)]
    public void SocialValidationEnforcesPlatformHttpsHosts(string platform, string url, bool valid)
    {
        var errors = RestaurantValidation.ValidateSocialLinks(
            new UpdateSocialLinksRequest([new AdminSocialLinkRequest(platform, url)]));
        Assert.Equal(valid, errors.Count == 0);
    }

    /// <summary>
    /// BUG-006: the backend already accepts an Instagram link alongside an ID-style Facebook profile URL; the
    /// failure lived in the frontend's free-text platform field. This pins the backend half so it cannot regress.
    /// </summary>
    [Fact]
    public void InstagramAndIdStyleFacebookLinksAreValidTogether()
    {
        var errors = RestaurantValidation.ValidateSocialLinks(new UpdateSocialLinksRequest(
        [
            new AdminSocialLinkRequest("instagram", "https://www.instagram.com/prairie_table"),
            new AdminSocialLinkRequest("facebook", "https://www.facebook.com/profile.php?id=100073564902779")
        ]));

        Assert.Empty(errors);
    }

    [Fact]
    public void UrlSavedUnderTheWrongPlatformIsRejectedUnderThatPlatformOnly()
    {
        var errors = RestaurantValidation.ValidateSocialLinks(new UpdateSocialLinksRequest(
        [
            new AdminSocialLinkRequest("instagram", "https://www.facebook.com/profile.php?id=100073564902779"),
            new AdminSocialLinkRequest("facebook", "https://www.facebook.com/profile.php?id=100073564902779")
        ]));

        Assert.Equal(["social_url_invalid"], errors["links.instagram"]);
        Assert.DoesNotContain("links.facebook", errors.Keys);
    }

    [Fact]
    public void SocialLinkCountCapWidensWithTheSupportedPlatformSet()
    {
        // The cap is SocialHosts.Count, so every supported platform must fit in one request.
        var links = new[] { "instagram", "facebook", "tiktok", "google_business", "x", "youtube", "linkedin" }
            .Select(platform => new AdminSocialLinkRequest(platform, SocialUrl(platform)))
            .ToArray();
        Assert.Empty(RestaurantValidation.ValidateSocialLinks(new UpdateSocialLinksRequest(links)));
    }

    [Theory]
    [InlineData("Restaurant", true)]
    [InlineData("CafeOrCoffeeShop", true)]
    [InlineData("Winery", true)]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("restaurant", false)]
    [InlineData("FoodEstablishment", false)]
    [InlineData("Nightclub", false)]
    public void RestaurantTypeMustBeNullEmptyOrAnExactSchemaOrgSubtype(string? value, bool valid)
    {
        var errors = RestaurantValidation.ValidateProfile(ValidProfile() with { RestaurantType = value });
        Assert.Equal(valid, errors.Count == 0);
        if (!valid)
        {
            Assert.Equal(["restaurant_type_invalid"], errors["restaurantType"]);
        }
    }

    [Theory]
    [InlineData("$", true)]
    [InlineData("$$", true)]
    [InlineData("$$$", true)]
    [InlineData("$$$$", true)]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("$$$$$", false)]
    [InlineData("cheap", false)]
    [InlineData("€€", false)]
    public void PriceRangeMustBeNullEmptyOrOneOfTheFourBands(string? value, bool valid)
    {
        var errors = RestaurantValidation.ValidateProfile(ValidProfile() with { PriceRange = value });
        Assert.Equal(valid, errors.Count == 0);
        if (!valid)
        {
            Assert.Equal(["price_range_invalid"], errors["priceRange"]);
        }
    }

    /// <summary>
    /// BUG-001: About is optional and blank means "none", so null, empty and whitespace-only all pass; the cap
    /// is 2000 characters after trimming, reported under the same generic code <c>description</c> uses.
    /// </summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   \n\t  ")]
    [InlineData("First paragraph.\n\nSecond paragraph.\r\n\r\nThird paragraph.")]
    public void AboutAcceptsNullBlankAndMultiParagraphCopy(string? value)
    {
        Assert.Empty(RestaurantValidation.ValidateProfile(ValidProfile() with { About = value }));
    }

    [Fact]
    public void AboutAcceptsExactlyTwoThousandCharactersAndMeasuresAfterTrimming()
    {
        var atLimit = new string('a', RestaurantValidation.MaximumAboutLength);
        Assert.Equal(2000, atLimit.Length);
        Assert.Empty(RestaurantValidation.ValidateProfile(ValidProfile() with { About = atLimit }));
        Assert.Empty(RestaurantValidation.ValidateProfile(ValidProfile() with { About = $"  \n{atLimit}\n  " }));
    }

    [Fact]
    public void AboutOverTwoThousandCharactersIsRejectedWithTheSameCodeAsDescription()
    {
        var errors = RestaurantValidation.ValidateProfile(ValidProfile() with { About = new string('a', 2001) });

        Assert.Equal(["field_length_invalid"], errors["about"]);
        Assert.Equal(["field_length_invalid"],
            RestaurantValidation.ValidateProfile(ValidProfile() with { Description = new string('a', 301) })["description"]);
    }

    [Fact]
    public void AboutRejectsControlCharactersOtherThanLineBreaksAndTabs()
    {
        var errors = RestaurantValidation.ValidateProfile(ValidProfile() with { About = "Hello\u0007world" });

        Assert.Equal(["field_length_invalid"], errors["about"]);
    }

    private static string SocialUrl(string platform) => platform switch
    {
        "instagram" => "https://www.instagram.com/prairie_table",
        "facebook" => "https://www.facebook.com/prairie_table",
        "tiktok" => "https://www.tiktok.com/@prairie_table",
        "google_business" => "https://maps.app.goo.gl/prairie",
        "x" => "https://x.com/prairie_table",
        "youtube" => "https://www.youtube.com/@prairietable",
        "linkedin" => "https://www.linkedin.com/company/prairie-table",
        _ => throw new ArgumentOutOfRangeException(nameof(platform))
    };

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
