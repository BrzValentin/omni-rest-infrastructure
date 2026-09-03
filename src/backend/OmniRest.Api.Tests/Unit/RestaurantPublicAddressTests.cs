using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Tests.Unit;

/// <summary>
/// PR-26: the dashboard's QR code must encode the tenant's public host, which the owner portal cannot
/// derive from its own request host. These cover the precedence and the tie-break directly, without a
/// database in the way.
/// </summary>
public sealed class RestaurantPublicAddressTests
{
    [Fact]
    public void SingleCustomDomainIsThePublicAddress()
    {
        var address = RestaurantPublicAddresses.Resolve(["menu.localhost"], "menu", ["example.app"]);

        Assert.Equal("menu.localhost", address.Host);
        Assert.Equal(RestaurantPublicAddressSource.Domain, address.Source);
    }

    [Fact]
    public void ShortestDomainWinsSoTheApexBeatsAWwwOrRegionalPrefix()
    {
        var address = RestaurantPublicAddresses.Resolve(
            ["www.prairietable.com", "prairietable.com", "mb.prairietable.com"], "prairie-table", []);

        Assert.Equal("prairietable.com", address.Host);
        Assert.Equal(RestaurantPublicAddressSource.Domain, address.Source);
    }

    [Fact]
    public void EqualLengthDomainsAreBrokenByOrdinalComparisonSoTheChoiceIsStable()
    {
        // Both hosts are the same length, so only the ordinal tie-break decides — and it must decide the
        // same way whatever order restaurant_domains happens to return the rows in.
        var forward = RestaurantPublicAddresses.Resolve(["b-table.com", "a-table.com"], null, []);
        var reversed = RestaurantPublicAddresses.Resolve(["a-table.com", "b-table.com"], null, []);

        Assert.Equal("a-table.com", forward.Host);
        Assert.Equal(forward, reversed);
    }

    [Fact]
    public void CustomDomainWinsOverTheSlugEvenWhenAPlatformBaseDomainIsConfigured()
    {
        var address = RestaurantPublicAddresses.Resolve(["prairietable.com"], "prairie-table", ["example.app"]);

        Assert.Equal("prairietable.com", address.Host);
        Assert.Equal(RestaurantPublicAddressSource.Domain, address.Source);
    }

    [Fact]
    public void SlugBeneathTheFirstPlatformBaseDomainIsUsedWhenThereIsNoCustomDomain()
    {
        var address = RestaurantPublicAddresses.Resolve([], "prairie-table", ["example.app", "other.app"]);

        Assert.Equal("prairie-table.example.app", address.Host);
        Assert.Equal(RestaurantPublicAddressSource.Slug, address.Source);
    }

    [Fact]
    public void SlugWithoutAnyConfiguredPlatformBaseDomainHasNoPublicAddress()
    {
        // Subdomain resolution is opt-in per deployment, so a slug alone is not a reachable host.
        var address = RestaurantPublicAddresses.Resolve([], "prairie-table", []);

        Assert.Null(address.Host);
        Assert.Equal(RestaurantPublicAddressSource.None, address.Source);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void NoDomainAndNoUsableSlugHasNoPublicAddress(string? slug)
    {
        var address = RestaurantPublicAddresses.Resolve([], slug, ["example.app"]);

        Assert.Null(address.Host);
        Assert.Equal(RestaurantPublicAddressSource.None, address.Source);
    }

    [Fact]
    public void NullAndWhitespaceDomainEntriesAreIgnoredRatherThanPrinted()
    {
        // A half-written row must never become the address on a table tent.
        var address = RestaurantPublicAddresses.Resolve([null, "   ", "", "prairietable.com"], "prairie-table", []);

        Assert.Equal("prairietable.com", address.Host);
        Assert.Equal(RestaurantPublicAddressSource.Domain, address.Source);
    }

    [Fact]
    public void AllDomainEntriesUnusableFallsBackToTheSlug()
    {
        var address = RestaurantPublicAddresses.Resolve([null, "  "], "prairie-table", ["example.app"]);

        Assert.Equal("prairie-table.example.app", address.Host);
        Assert.Equal(RestaurantPublicAddressSource.Slug, address.Source);
    }

    [Fact]
    public void DomainHostsAreNormalisedToLowercaseAndTrimmed()
    {
        var address = RestaurantPublicAddresses.Resolve(["  PrairieTable.COM  "], null, []);

        Assert.Equal("prairietable.com", address.Host);
    }

    [Fact]
    public void SlugAndPlatformBaseDomainAreNormalisedToLowercaseAndTrimmed()
    {
        var address = RestaurantPublicAddresses.Resolve([], " Prairie-Table ", [" Example.App "]);

        Assert.Equal("prairie-table.example.app", address.Host);
        Assert.Equal(RestaurantPublicAddressSource.Slug, address.Source);
    }

    [Theory]
    [InlineData(".example.app")]
    [InlineData("example.app.")]
    [InlineData(".example.app.")]
    public void PlatformBaseDomainWrittenWithLeadingOrTrailingDotsDoesNotProduceADoubleDot(string baseDomain)
    {
        var address = RestaurantPublicAddresses.Resolve([], "prairie-table", [baseDomain]);

        Assert.Equal("prairie-table.example.app", address.Host);
        Assert.Equal(RestaurantPublicAddressSource.Slug, address.Source);
    }

    [Fact]
    public void PlatformBaseDomainThatNormalisesAwayIsSkippedInFavourOfTheNextOne()
    {
        // RestaurantResolver drops empty entries before matching, so the address must be built from the
        // first entry that survives the same normalisation rather than from index zero literally.
        var address = RestaurantPublicAddresses.Resolve([], "prairie-table", ["   ", ".", "example.app"]);

        Assert.Equal("prairie-table.example.app", address.Host);
        Assert.Equal(RestaurantPublicAddressSource.Slug, address.Source);
    }

    [Theory]
    [InlineData(RestaurantPublicAddressSource.Domain, "domain")]
    [InlineData(RestaurantPublicAddressSource.Slug, "slug")]
    [InlineData(RestaurantPublicAddressSource.None, "none")]
    public void SourceIsCarriedOnTheWireAsALowercaseString(RestaurantPublicAddressSource source, string expected)
    {
        Assert.Equal(expected, RestaurantPublicAddresses.ToWireValue(source));
    }
}
