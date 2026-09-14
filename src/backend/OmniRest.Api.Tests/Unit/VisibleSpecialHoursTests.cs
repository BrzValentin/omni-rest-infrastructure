using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Tests.Unit;

/// <summary>
/// BUG-007: expired special hours must drop off the public site on their own, judged by the restaurant's
/// local date. Winnipeg is on CDT (UTC-5) throughout August 2026, so every instant below is five hours
/// ahead of the local wall-clock time its comment names.
/// </summary>
public sealed class VisibleSpecialHoursTests
{
    private const string Winnipeg = "America/Winnipeg";

    [Fact]
    public void EntryDatedYesterdayIsHiddenWhileTodayAndFutureEntriesStayInOrder()
    {
        var restaurant = CreateRestaurant(Winnipeg,
        [
            new PublicSpecialHours("2026-08-03", false, "yesterday lunch", [Interval("10:00", "14:00")]),
            new PublicSpecialHours("2026-08-04", false, "today lunch", [Interval("10:00", "14:00")]),
            new PublicSpecialHours("2026-12-25", true, "Christmas", [])
        ]);

        // 12:00 local on 2026-08-04.
        var visible = PublicSpecialHoursVisibility.VisibleSpecialHours(restaurant, DateTimeOffset.Parse("2026-08-04T17:00:00Z"));

        Assert.Equal(["2026-08-04", "2026-12-25"], visible.Select(item => item.Date).ToArray());
    }

    [Theory]
    [InlineData("2026-08-05T04:30:00Z")] // 23:30 local on 2026-08-04, already 2026-08-05 in UTC
    [InlineData("2026-08-05T04:59:59Z")] // 23:59:59 local on 2026-08-04
    public void EntryDatedTodayStaysVisibleUntilLocalMidnightEvenWhenUtcIsAlreadyTomorrow(string now)
    {
        var restaurant = CreateRestaurant(Winnipeg,
        [
            new PublicSpecialHours("2026-08-04", false, "today lunch", [Interval("10:00", "14:00")])
        ]);

        var visible = PublicSpecialHoursVisibility.VisibleSpecialHours(restaurant, DateTimeOffset.Parse(now));

        Assert.Equal("2026-08-04", Assert.Single(visible).Date);
    }

    [Fact]
    public void EntryWithoutOvernightIntervalIsHiddenFromLocalMidnight()
    {
        var restaurant = CreateRestaurant(Winnipeg,
        [
            new PublicSpecialHours("2026-08-04", false, "today lunch", [Interval("10:00", "14:00")])
        ]);

        // 00:00 local on 2026-08-05.
        var visible = PublicSpecialHoursVisibility.VisibleSpecialHours(restaurant, DateTimeOffset.Parse("2026-08-05T05:00:00Z"));

        Assert.Empty(visible);
    }

    [Fact]
    public void FutureEntriesAreUnaffected()
    {
        var restaurant = CreateRestaurant(Winnipeg,
        [
            new PublicSpecialHours("2026-08-05", true, "tomorrow closed", []),
            new PublicSpecialHours("2027-01-01", false, "New Year brunch", [Interval("09:00", "13:00")])
        ]);

        var visible = PublicSpecialHoursVisibility.VisibleSpecialHours(restaurant, DateTimeOffset.Parse("2026-08-04T17:00:00Z"));

        Assert.Equal(["2026-08-05", "2027-01-01"], visible.Select(item => item.Date).ToArray());
    }

    [Theory]
    [InlineData("2026-08-04T06:30:00Z", true)]  // 01:30 local: yesterday's 22:00-02:00 is still running
    [InlineData("2026-08-04T07:00:00Z", false)] // 02:00 local: the close is exclusive, as in the status
    [InlineData("2026-08-04T07:30:00Z", false)] // 02:30 local: the carryover has ended
    public void YesterdaysOvernightEntryStaysVisibleOnlyWhileItsIntervalIsStillRunning(string now, bool expectedVisible)
    {
        var restaurant = CreateRestaurant(Winnipeg,
        [
            new PublicSpecialHours("2026-08-03", false, "late event", [Interval("22:00", "02:00", overnight: true)])
        ]);

        var visible = PublicSpecialHoursVisibility.VisibleSpecialHours(restaurant, DateTimeOffset.Parse(now));

        Assert.Equal(expectedVisible, visible.Any(item => item.Date == "2026-08-03"));
    }

    [Fact]
    public void ClosedEntryDatedYesterdayIsHiddenAfterLocalMidnight()
    {
        var restaurant = CreateRestaurant(Winnipeg,
        [
            new PublicSpecialHours("2026-08-03", true, "closed", [])
        ]);

        // 01:30 local on 2026-08-04.
        var visible = PublicSpecialHoursVisibility.VisibleSpecialHours(restaurant, DateTimeOffset.Parse("2026-08-04T06:30:00Z"));

        Assert.Empty(visible);
    }

    [Fact]
    public void EntryDatedTwoDaysAgoIsHiddenEvenWithAnOvernightInterval()
    {
        var restaurant = CreateRestaurant(Winnipeg,
        [
            new PublicSpecialHours("2026-08-02", false, "late event", [Interval("22:00", "02:00", overnight: true)])
        ]);

        // 01:30 local on 2026-08-04.
        var visible = PublicSpecialHoursVisibility.VisibleSpecialHours(restaurant, DateTimeOffset.Parse("2026-08-04T06:30:00Z"));

        Assert.Empty(visible);
    }

    [Fact]
    public void UnknownTimeZoneFallsBackToUtcDateMinusOneSoNothingStillCurrentIsHidden()
    {
        var restaurant = CreateRestaurant("Not/A_Real_Zone",
        [
            new PublicSpecialHours("2026-08-03", false, "two UTC days ago", [Interval("10:00", "14:00")]),
            new PublicSpecialHours("2026-08-04", false, "one UTC day ago", [Interval("10:00", "14:00")]),
            new PublicSpecialHours("2026-08-05", false, "UTC today", [Interval("10:00", "14:00")])
        ]);

        var visible = PublicSpecialHoursVisibility.VisibleSpecialHours(restaurant, DateTimeOffset.Parse("2026-08-05T04:30:00Z"));

        Assert.Equal(["2026-08-04", "2026-08-05"], visible.Select(item => item.Date).ToArray());
    }

    [Fact]
    public void AtInstantComputesStatusFromTheUnfilteredListAndLeavesTheSourceRecordUntouched()
    {
        var restaurant = CreateRestaurant(Winnipeg,
        [
            new PublicSpecialHours("2026-08-01", true, "long gone", []),
            new PublicSpecialHours("2026-08-03", false, "late event", [Interval("22:00", "02:00", overnight: true)])
        ]);

        // 01:30 local on 2026-08-04: the status comes from yesterday's entry, which therefore stays listed.
        var view = PublicSpecialHoursVisibility.AtInstant(
            restaurant, new RestaurantStatusCalculator(), DateTimeOffset.Parse("2026-08-04T06:30:00Z"));

        Assert.Equal(("open", "Closes at 2:00 AM", "specialHours"), (view.Status.State, view.Status.Label, view.Status.Source));
        Assert.Equal("2026-08-03", Assert.Single(view.SpecialHours).Date);
        Assert.Equal(2, restaurant.SpecialHours.Count);
        Assert.Equal("Closed", restaurant.Status.Label);
    }

    private static PublicHourInterval Interval(string opens, string closes, bool overnight = false) =>
        new($"{opens}:00", $"{closes}:00", overnight);

    private static PublicRestaurantResponse CreateRestaurant(string timeZone, IReadOnlyList<PublicSpecialHours> special) => new(
        "id", "Test", null, null, null, timeZone, null, [], special,
        new PublicRestaurantStatus("closed", "Closed", null, "regularHours"), [], null, "1", []);
}
