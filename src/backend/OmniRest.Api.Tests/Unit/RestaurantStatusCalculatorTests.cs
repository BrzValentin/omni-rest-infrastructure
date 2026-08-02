using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Tests.Unit;

public sealed class RestaurantStatusCalculatorTests
{
    private readonly RestaurantStatusCalculator calculator = new();

    [Theory]
    [InlineData("2026-08-04T00:00:00Z", "open")]
    [InlineData("2026-08-04T01:59:59Z", "open")]
    [InlineData("2026-08-04T02:00:00Z", "closed")]
    public void PreviousDayRegularOvernightCarryoverUsesMidnightAndExclusiveCloseBoundaries(
        string now,
        string expectedState)
    {
        var restaurant = CreateRestaurant(
            regular: [new PublicRegularHours(1, [Interval("20:00", "02:00", overnight: true)])],
            special: []);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse(now));

        Assert.Equal(expectedState, status.State);
        if (expectedState == "open")
        {
            Assert.Equal("regularHours", status.Source);
            Assert.Equal(DateTimeOffset.Parse("2026-08-04T02:00:00Z"), status.NextChangeAt);
        }
    }

    [Theory]
    [InlineData("2026-08-04T01:00:00Z", "closed", "Opens at 20:00")]
    [InlineData("2026-08-04T19:59:59Z", "closed", "Opens at 20:00")]
    [InlineData("2026-08-04T20:00:00Z", "open", "Open now")]
    public void CurrentDayOvernightNeverOpensBeforeItsStart(
        string now,
        string expectedState,
        string expectedLabel)
    {
        var restaurant = CreateRestaurant(
            regular: [new PublicRegularHours(2, [Interval("20:00", "02:00", overnight: true)])],
            special: []);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse(now));

        Assert.Equal((expectedState, expectedLabel, "regularHours"), (status.State, status.Label, status.Source));
    }

    [Fact]
    public void PreviousDaySpecialOvernightReplacesPreviousRegularCarryover()
    {
        var restaurant = CreateRestaurant(
            regular: [new PublicRegularHours(1, [Interval("20:00", "02:00", overnight: true)])],
            special:
            [
                new PublicSpecialHours("2026-08-03", false, "late event", [Interval("22:00", "03:00", overnight: true)])
            ]);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse("2026-08-04T02:30:00Z"));

        Assert.Equal(("open", "specialHours"), (status.State, status.Source));
        Assert.Equal(DateTimeOffset.Parse("2026-08-04T03:00:00Z"), status.NextChangeAt);
    }

    [Fact]
    public void PreviousDayClosedSpecialSuppressesPreviousRegularCarryover()
    {
        var restaurant = CreateRestaurant(
            regular: [new PublicRegularHours(1, [Interval("20:00", "02:00", overnight: true)])],
            special: [new PublicSpecialHours("2026-08-03", true, "closed", [])]);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse("2026-08-04T01:00:00Z"));

        Assert.Equal(("closed", "regularHours"), (status.State, status.Source));
    }

    [Fact]
    public void TodayClosedSpecialSuppressesAllPreviousCarryoverAndRegularHours()
    {
        var restaurant = CreateRestaurant(
            regular:
            [
                new PublicRegularHours(1, [Interval("20:00", "02:00", overnight: true)]),
                new PublicRegularHours(2, [Interval("00:00", "23:00")])
            ],
            special: [new PublicSpecialHours("2026-08-04", true, "closed today", [])]);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse("2026-08-04T01:00:00Z"));

        Assert.Equal(("closed", "specialHours"), (status.State, status.Source));
        Assert.Null(status.NextChangeAt);
    }

    [Theory]
    [InlineData("2026-08-04T01:00:00Z", "closed", "Opens at 10:00")]
    [InlineData("2026-08-04T10:00:00Z", "open", "Open now")]
    [InlineData("2026-08-04T14:00:00Z", "closed", "Closed")]
    public void TodayOpenSpecialSuppressesPreviousCarryoverAndUsesInclusiveStartExclusiveEnd(
        string now,
        string expectedState,
        string expectedLabel)
    {
        var restaurant = CreateRestaurant(
            regular:
            [
                new PublicRegularHours(1, [Interval("20:00", "02:00", overnight: true)]),
                new PublicRegularHours(2, [Interval("00:00", "23:00")])
            ],
            special: [new PublicSpecialHours("2026-08-04", false, "lunch", [Interval("10:00", "14:00")])]);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse(now));

        Assert.Equal((expectedState, expectedLabel, "specialHours"), (status.State, status.Label, status.Source));
    }

    [Theory]
    [InlineData("2026-08-04T01:00:00Z", "closed")]
    [InlineData("2026-08-04T22:00:00Z", "open")]
    [InlineData("2026-08-05T01:59:59Z", "open")]
    [InlineData("2026-08-05T02:00:00Z", "closed")]
    public void SpecialOvernightUsesCurrentStartThenPreviousDayCarryoverOnly(
        string now,
        string expectedState)
    {
        var restaurant = CreateRestaurant(
            regular: [],
            special: [new PublicSpecialHours("2026-08-04", false, "late", [Interval("22:00", "02:00", overnight: true)])]);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse(now));

        Assert.Equal(expectedState, status.State);
        Assert.Equal(now.StartsWith("2026-08-04", StringComparison.Ordinal) || expectedState == "open"
            ? "specialHours"
            : "regularHours", status.Source);
    }

    [Theory]
    [InlineData("2026-08-04T08:59:59Z", "closed")]
    [InlineData("2026-08-04T09:00:00Z", "open")]
    [InlineData("2026-08-04T17:00:00Z", "closed")]
    public void CurrentRegularIntervalUsesInclusiveStartAndExclusiveEnd(string now, string expectedState)
    {
        var restaurant = CreateRestaurant(
            regular: [new PublicRegularHours(2, [Interval("09:00", "17:00")])],
            special: []);

        Assert.Equal(expectedState, calculator.Calculate(restaurant, DateTimeOffset.Parse(now)).State);
    }

    private static PublicHourInterval Interval(string opens, string closes, bool overnight = false) =>
        new($"{opens}:00", $"{closes}:00", overnight);

    private static PublicRestaurantResponse CreateRestaurant(
        IReadOnlyList<PublicRegularHours> regular,
        IReadOnlyList<PublicSpecialHours> special) => new(
        "id", "Test", null, null, null, "UTC", null, regular, special,
        new PublicRestaurantStatus("closed", "Closed", null, "regularHours"), [], null, "1");
}
