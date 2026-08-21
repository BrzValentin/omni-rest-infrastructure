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
    [InlineData("2026-08-04T20:00:00Z", "open", "Closes at 02:00")]
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

        Assert.Equal(("closed", "regularHours"), (status.State, status.Source));
        Assert.Equal("Opens at 20:00", status.Label);
        Assert.Equal(DateTimeOffset.Parse("2026-08-10T20:00:00Z"), status.NextChangeAt);
    }

    [Theory]
    [InlineData("2026-08-04T01:00:00Z", "closed", "Opens at 10:00", "specialHours")]
    [InlineData("2026-08-04T10:00:00Z", "open", "Closes at 14:00", "specialHours")]
    [InlineData("2026-08-04T14:00:00Z", "closed", "Opens at 20:00", "regularHours")]
    public void TodayOpenSpecialSuppressesPreviousCarryoverAndUsesInclusiveStartExclusiveEnd(
        string now,
        string expectedState,
        string expectedLabel,
        string expectedSource)
    {
        var restaurant = CreateRestaurant(
            regular:
            [
                new PublicRegularHours(1, [Interval("20:00", "02:00", overnight: true)]),
                new PublicRegularHours(2, [Interval("00:00", "23:00")])
            ],
            special: [new PublicSpecialHours("2026-08-04", false, "lunch", [Interval("10:00", "14:00")])]);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse(now));

        Assert.Equal((expectedState, expectedLabel, expectedSource), (status.State, status.Label, status.Source));
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

    [Fact]
    public void AfterLastCloseFindsTomorrowOpening()
    {
        var restaurant = CreateRestaurant(
            regular:
            [
                new PublicRegularHours(2, [Interval("09:00", "17:00")]),
                new PublicRegularHours(3, [Interval("09:00", "17:00")])
            ],
            special: []);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse("2026-08-04T18:00:00Z"));

        Assert.Equal(("closed", "Opens at 09:00", "regularHours"), (status.State, status.Label, status.Source));
        Assert.Equal(DateTimeOffset.Parse("2026-08-05T09:00:00Z"), status.NextChangeAt);
    }

    [Fact]
    public void InsideIntervalReportsClosingTime()
    {
        var restaurant = CreateRestaurant(
            regular: [new PublicRegularHours(2, [Interval("09:00", "17:00")])],
            special: []);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse("2026-08-04T10:00:00Z"));

        Assert.Equal(("open", "Closes at 17:00", "regularHours"), (status.State, status.Label, status.Source));
        Assert.Equal(DateTimeOffset.Parse("2026-08-04T17:00:00Z"), status.NextChangeAt);
    }

    [Fact]
    public void ClosedWeekdaySkipsToNextOpenWeekday()
    {
        var restaurant = CreateRestaurant(
            regular: [new PublicRegularHours(5, [Interval("08:30", "16:00")])],
            special: []);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse("2026-08-04T12:00:00Z"));

        Assert.Equal(("closed", "Opens at 08:30", "regularHours"), (status.State, status.Label, status.Source));
        Assert.Equal(DateTimeOffset.Parse("2026-08-07T08:30:00Z"), status.NextChangeAt);
    }

    [Fact]
    public void ClosedSpecialDateOverridesRegularHoursDuringLookAhead()
    {
        var restaurant = CreateRestaurant(
            regular:
            [
                new PublicRegularHours(1, [Interval("09:00", "17:00")]),
                new PublicRegularHours(2, [Interval("09:00", "17:00")]),
                new PublicRegularHours(3, [Interval("09:00", "17:00")])
            ],
            special: [new PublicSpecialHours("2026-08-04", true, "closed", [])]);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse("2026-08-03T18:00:00Z"));

        Assert.Equal(("closed", "Opens at 09:00", "regularHours"), (status.State, status.Label, status.Source));
        Assert.Equal(DateTimeOffset.Parse("2026-08-05T09:00:00Z"), status.NextChangeAt);
    }

    [Fact]
    public void SpecialHoursOpeningOverridesRegularHoursDuringLookAhead()
    {
        var restaurant = CreateRestaurant(
            regular:
            [
                new PublicRegularHours(1, [Interval("09:00", "17:00")]),
                new PublicRegularHours(2, [Interval("09:00", "17:00")])
            ],
            special: [new PublicSpecialHours("2026-08-04", false, "late opening", [Interval("11:30", "18:00")])]);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse("2026-08-03T18:00:00Z"));

        Assert.Equal(("closed", "Opens at 11:30", "specialHours"), (status.State, status.Label, status.Source));
        Assert.Equal(DateTimeOffset.Parse("2026-08-04T11:30:00Z"), status.NextChangeAt);
    }

    [Fact]
    public void NoOpeningWithinSevenDaysRemainsClosedWithoutNextChange()
    {
        var restaurant = CreateRestaurant(regular: [], special: []);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse("2026-08-04T12:00:00Z"));

        Assert.Equal(("closed", "Closed", "regularHours"), (status.State, status.Label, status.Source));
        Assert.Null(status.NextChangeAt);
    }

    [Theory]
    [InlineData("2026-08-04T23:00:00Z", "Closes at 02:00")]
    [InlineData("2026-08-05T01:00:00Z", "Closes at 02:00")]
    public void OvernightIntervalReportsClosingTimeBeforeAndAfterMidnight(string now, string expectedLabel)
    {
        var restaurant = CreateRestaurant(
            regular: [new PublicRegularHours(2, [Interval("20:00", "02:00", overnight: true)])],
            special: []);

        var status = calculator.Calculate(restaurant, DateTimeOffset.Parse(now));

        Assert.Equal(("open", expectedLabel, "regularHours"), (status.State, status.Label, status.Source));
        Assert.Equal(DateTimeOffset.Parse("2026-08-05T02:00:00Z"), status.NextChangeAt);
    }

    private static PublicHourInterval Interval(string opens, string closes, bool overnight = false) =>
        new($"{opens}:00", $"{closes}:00", overnight);

    private static PublicRestaurantResponse CreateRestaurant(
        IReadOnlyList<PublicRegularHours> regular,
        IReadOnlyList<PublicSpecialHours> special) => new(
        "id", "Test", null, null, null, "UTC", null, regular, special,
        new PublicRestaurantStatus("closed", "Closed", null, "regularHours"), [], null, "1");
}
