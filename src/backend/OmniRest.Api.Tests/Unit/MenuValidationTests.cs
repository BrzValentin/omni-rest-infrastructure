using Microsoft.AspNetCore.Http;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;

namespace OmniRest.Api.Tests.Unit;

public sealed class MenuValidationTests
{
    [Fact]
    public void SlugsAreNormalizedUniqueAndDeterministic()
    {
        var id = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var existing = new HashSet<string>(StringComparer.Ordinal);

        var first = MenuValidation.CreateSlug("  Crème & Soup  ", id, existing);
        var second = MenuValidation.CreateSlug("Creme Soup", Guid.Parse("22222222-2222-2222-2222-222222222222"), existing);
        var fallback = MenuValidation.CreateSlug("日本語", Guid.Parse("33333333-3333-3333-3333-333333333333"), existing);

        Assert.Equal("creme-soup", first);
        Assert.StartsWith("creme-soup-", second, StringComparison.Ordinal);
        Assert.StartsWith("category-", fallback, StringComparison.Ordinal);
    }

    [Fact]
    public void BadgeAssignmentsRejectUnknownAndDuplicateCodes()
    {
        Assert.Throws<ArgumentException>(() => MenuValidation.ValidateBadgeAssignments(["vegan", "vegan"]));
        Assert.Throws<ArgumentException>(() => MenuValidation.ValidateBadgeAssignments(["medical_claim"]));
        MenuValidation.ValidateBadgeAssignments(BadgeCatalog.Codes);
    }

    [Theory]
    [InlineData("available", true)]
    [InlineData("unavailable", false)]
    public void OrderPredicatePreservesAvailabilityContract(string status, bool expected) =>
        Assert.Equal(expected, AvailabilityStatus.CanBeOrdered(status));

    [Theory]
    [InlineData("menu.localhost", "menu.localhost")]
    [InlineData("MENU.LOCALHOST:443", "menu.localhost")]
    [InlineData("127.0.0.1:5000", "127.0.0.1")]
    public void HostNormalizationRemovesPortAndNormalizesDns(string input, string expected)
    {
        Assert.True(RestaurantResolver.TryNormalizeHost(new HostString(input), out var actual));
        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData("")]
    [InlineData("bad host")]
    [InlineData("one.example,two.example")]
    [InlineData("https://menu.localhost")]
    public void HostNormalizationRejectsMalformedValues(string input) =>
        Assert.False(RestaurantResolver.TryNormalizeHost(new HostString(input), out _));

    [Fact]
    public void MediaValidationAllowsRelativeAndAllowlistedHttpsOnly()
    {
        IReadOnlySet<string> allowlist = new HashSet<string>(["cdn.example"], StringComparer.OrdinalIgnoreCase);
        Assert.True(MenuValidation.IsSafeMediaUrl("/media/dish.webp", allowlist));
        Assert.True(MenuValidation.IsSafeMediaUrl("https://cdn.example/dish.webp", allowlist));
        Assert.False(MenuValidation.IsSafeMediaUrl("//evil.example/dish.webp", allowlist));
        Assert.False(MenuValidation.IsSafeMediaUrl("http://cdn.example/dish.webp", allowlist));
        Assert.False(MenuValidation.IsSafeMediaUrl("https://evil.example/dish.webp", allowlist));
    }

    [Theory]
    [InlineData("/\\evil.example/x")]
    [InlineData("\\evil.example/x")]
    [InlineData("\\\\evil.example/x")]
    [InlineData("https:\\evil.example/x")]
    [InlineData("///evil.example/x")]
    [InlineData("https://user@cdn.example/x")]
    [InlineData("https://cdn.example:444/x")]
    public void MediaValidationRejectsAuthorityChangingOrNonAllowlistedOrigins(string value)
    {
        IReadOnlySet<string> allowlist = new HashSet<string>(["cdn.example"], StringComparer.OrdinalIgnoreCase);
        Assert.False(MenuValidation.IsSafeMediaUrl(value, allowlist));
    }
}
