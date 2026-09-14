using System.Globalization;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;
using DevelopmentProfile = OmniRest.Api.Infrastructure.GuardedSampleDataSeeder.DevelopmentProfile;

namespace OmniRest.Api.Tests.Integration;

/// <summary>
/// BUG-002: the local stack's Prairie Table must render every public section, but only in Development. The
/// integration suite seeds as Testing and is written against the bare restaurant, so the environment gate is
/// asserted from both sides. The host stays a Testing host; only the environment handed to the seeder differs,
/// which is exactly the switch <c>--seed-sample</c> flips.
/// </summary>
[Collection(PostgresCollection.Name)]
public sealed class DevelopmentSampleDataTests(PostgresFixture postgres)
{
    private const string PlaceholderPoutine = "Description for Prairie Poutine.";

    [Fact]
    public async Task DevelopmentSeedPublishesPrairieTableWithEveryPublicSectionPopulated()
    {
        using var factory = postgres.CreateFactory();
        await RecreateLatestWithoutSeedAsync(factory);

        await GuardedSampleDataSeeder.SeedAsync(factory.Services, Development(factory), large: false);

        using var client = CreatePublicClient(factory);
        var restaurant = await client.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
        Assert.NotNull(restaurant);
        Assert.Equal("Prairie Table", restaurant.Name);
        Assert.Equal(DevelopmentProfile.Description, restaurant.ShortDescription);
        Assert.True(restaurant.ShortDescription!.Length <= 300);
        Assert.Equal(DevelopmentProfile.About, restaurant.About);
        Assert.Equal(3, restaurant.About!.Split("\n\n").Length);
        Assert.True(restaurant.About.Length < RestaurantValidation.MaximumAboutLength);
        Assert.Equal("+12045550123", restaurant.Phone?.E164);
        Assert.Equal("(204) 555-0123", restaurant.Phone?.Display);
        Assert.Equal("hello@prairietable.example", restaurant.Email);
        Assert.Null(restaurant.WebsiteUrl);
        Assert.Equal("Restaurant", restaurant.RestaurantType);
        Assert.Equal("$$", restaurant.PriceRange);

        Assert.NotNull(restaurant.Address);
        Assert.Equal("Winnipeg", restaurant.Address.City);
        Assert.Equal("MB", restaurant.Address.Region);
        Assert.Equal("CA", restaurant.Address.CountryCode);
        Assert.Matches("^R3C [0-9][A-Z][0-9]$", restaurant.Address.PostalCode);
        Assert.Equal(49.8951m, restaurant.Address.Latitude);
        Assert.Equal(-97.1384m, restaurant.Address.Longitude);

        Assert.Equal(7, restaurant.RegularHours.Count);
        Assert.Empty(restaurant.RegularHours.Single(day => day.DayOfWeek == 1).Intervals);
        Assert.All(restaurant.RegularHours.Where(day => day.DayOfWeek != 1), day => Assert.NotEmpty(day.Intervals));
        Assert.Equal(2, restaurant.RegularHours.Single(day => day.DayOfWeek == 2).Intervals.Count);
        var saturday = restaurant.RegularHours.Single(day => day.DayOfWeek == 6).Intervals;
        Assert.Equal(2, saturday.Count);
        Assert.Contains(saturday, interval => interval.ClosesNextDay && interval.ClosesAt == "01:00:00");

        // Dated relative to the seeding clock; the range tolerates a local midnight between seeding and here.
        var special = Assert.Single(restaurant.SpecialHours);
        var specialDate = DateOnly.ParseExact(special.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var today = WinnipegToday();
        Assert.InRange(specialDate, today.AddDays(29), today.AddDays(30));
        Assert.False(special.IsClosed);
        Assert.NotEmpty(special.Intervals);

        Assert.Equal(
            new[]
            {
                ("facebook", "https://www.facebook.com/profile.php?id=100073564902779"),
                ("instagram", "https://www.instagram.com/prairietable")
            },
            restaurant.SocialLinks.Select(link => (link.Platform, link.Url)).ToArray());

        Assert.NotNull(restaurant.MainImage);
        Assert.EndsWith("/poutine-640.webp", Assert.Single(restaurant.MainImage.Variants).Url, StringComparison.Ordinal);
        Assert.Null(restaurant.Logo);
        Assert.Equal("2", restaurant.PublicationVersion);

        // The e2e-visible menu states survive: dish names, the unavailable soup and the empty Desserts category.
        var publicMenu = await client.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        Assert.NotNull(publicMenu?.Menu);
        var dishes = publicMenu.Menu.Categories.SelectMany(category => category.Dishes).ToArray();
        Assert.Equal(["Prairie Poutine", "Roasted Tomato Soup", "Spiced Chicken"], dishes.Select(dish => dish.Name).ToArray());
        Assert.All(dishes, dish => Assert.DoesNotContain("Description for", dish.Description ?? string.Empty, StringComparison.Ordinal));
        Assert.Equal(DevelopmentProfile.DishDescriptions["Prairie Poutine"], dishes[0].Description);
        Assert.Equal(AvailabilityStatus.Unavailable, dishes[1].Availability);
        Assert.Empty(publicMenu.Menu.Categories.Single(category => category.Name == "Desserts").Dishes);

        // The public renderers must never advertise features the product does not have.
        var copy = string.Join(' ', new[] { restaurant.ShortDescription, restaurant.About, special.Note }
            .Concat(dishes.Select(dish => dish.Description)));
        Assert.DoesNotMatch("(?i)reservation|booking|shop|gift card|events", copy);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var versions = await db.Publications.Where(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId)
            .OrderBy(item => item.Version).Select(item => item.Version).ToArrayAsync();
        Assert.Equal(new long[] { 1, 2 }, versions);
        Assert.Equal(2L, await db.Publications.Where(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId && item.IsCurrent)
            .Select(item => item.Version).SingleAsync());
    }

    [Fact]
    public async Task TestingSeedStillProducesTheBarePrairieTableTheIntegrationSuiteIsWrittenAgainst()
    {
        using var factory = postgres.CreateFactory();
        await postgres.RecreateLatestAndSeedAsync(factory);

        using var client = CreatePublicClient(factory);
        var restaurant = await client.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
        Assert.NotNull(restaurant);
        Assert.Null(restaurant.ShortDescription);
        Assert.Null(restaurant.About);
        Assert.Null(restaurant.Phone);
        Assert.Null(restaurant.Email);
        Assert.Null(restaurant.Address);
        Assert.All(restaurant.RegularHours, day => Assert.Empty(day.Intervals));
        Assert.Empty(restaurant.SpecialHours);
        Assert.Empty(restaurant.SocialLinks);
        Assert.Null(restaurant.MainImage);
        Assert.Null(restaurant.Logo);
        Assert.Null(restaurant.RestaurantType);
        Assert.Null(restaurant.PriceRange);
        Assert.Equal("1", restaurant.PublicationVersion);

        var publicMenu = await client.GetFromJsonAsync<PublicMenuResponse>("/api/v1/public/menu");
        Assert.Equal(
            PlaceholderPoutine,
            publicMenu!.Menu!.Categories.SelectMany(category => category.Dishes).Single(dish => dish.Name == "Prairie Poutine").Description);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        Assert.Equal(0, await db.PublicationOutbox.CountAsync(item => item.RestaurantId == GuardedSampleDataSeeder.OrdinaryRestaurantId));
    }

    [Fact]
    public async Task DevelopmentBackfillFillsOnlyEmptyFieldsPublishesOnceAndIsANoOpOnTheSecondRun()
    {
        using var factory = postgres.CreateFactory();
        // An existing database seeded before BUG-002: the bare restaurant at publication version 1.
        await postgres.RecreateLatestAndSeedAsync(factory);
        const string ownerDescription = "The owner's own summary.";
        const string ownerEmail = "owner@prairietable.example";
        const string ownerInstagram = "https://www.instagram.com/owner_edit";
        const string ownerChicken = "The owner's own words about the chicken.";
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var restaurant = await db.Restaurants.SingleAsync(item => item.Id == GuardedSampleDataSeeder.OrdinaryRestaurantId);
            restaurant.Description = ownerDescription;
            restaurant.Email = ownerEmail;
            db.SocialLinks.Add(new SocialLinkEntity
            {
                Id = Guid.NewGuid(),
                RestaurantId = restaurant.Id,
                Platform = "instagram",
                Url = ownerInstagram
            });
            var chicken = await db.Dishes.SingleAsync(item => item.RestaurantId == restaurant.Id && item.Name == "Spiced Chicken");
            chicken.Description = ownerChicken;
            await db.SaveChangesAsync();
        }

        var development = Development(factory);
        await GuardedSampleDataSeeder.SeedAsync(factory.Services, development, large: false);

        Snapshot afterFirstRun;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var restaurant = await LoadAsync(db);

            // Owner-edited values are untouched, including a social-links list that holds only one platform.
            Assert.Equal(ownerDescription, restaurant.Description);
            Assert.Equal(ownerEmail, restaurant.Email);
            Assert.Equal(ownerInstagram, Assert.Single(restaurant.SocialLinks).Url);
            Assert.Equal(ownerChicken, restaurant.Menus.SelectMany(menu => menu.Categories).SelectMany(category => category.Dishes)
                .Single(dish => dish.Name == "Spiced Chicken").Description);

            // Every empty field is filled.
            Assert.Equal(DevelopmentProfile.About, restaurant.About);
            Assert.Equal("+12045550123", restaurant.PhoneE164);
            Assert.Equal("(204) 555-0123", restaurant.PhoneDisplay);
            Assert.Equal("Restaurant", restaurant.RestaurantType);
            Assert.Equal("$$", restaurant.PriceRange);
            Assert.Equal("Winnipeg", restaurant.Address?.City);
            Assert.Equal(8, restaurant.RegularHours.Count);
            Assert.Single(restaurant.SpecialHours);
            Assert.NotNull(restaurant.MainMediaAssetId);
            Assert.Null(restaurant.LogoMediaAssetId);
            Assert.Equal(DevelopmentProfile.DishDescriptions["Prairie Poutine"], restaurant.Menus.SelectMany(menu => menu.Categories)
                .SelectMany(category => category.Dishes).Single(dish => dish.Name == "Prairie Poutine").Description);

            // Exactly one new publication, through the outbox, at the next version.
            Assert.Equal(2L, restaurant.DraftVersion);
            afterFirstRun = await CaptureAsync(db, restaurant);
            Assert.Equal([1L, 2L], afterFirstRun.PublicationVersions);
            Assert.Equal(2L, afterFirstRun.CurrentVersion);
            Assert.Equal(1, afterFirstRun.OutboxCount);
        }

        using (var client = CreatePublicClient(factory))
        {
            var published = await client.GetFromJsonAsync<PublicRestaurantResponse>("/api/v1/public/restaurant");
            Assert.Equal("2", published!.PublicationVersion);
            Assert.Equal(ownerDescription, published.ShortDescription);
            Assert.Equal(DevelopmentProfile.About, published.About);
            Assert.Equal(ownerInstagram, Assert.Single(published.SocialLinks).Url);
            Assert.NotNull(published.Address);
            Assert.NotNull(published.MainImage);
        }

        await GuardedSampleDataSeeder.SeedAsync(factory.Services, development, large: false);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
            var restaurant = await LoadAsync(db);
            var afterSecondRun = await CaptureAsync(db, restaurant);
            Assert.Equal(afterFirstRun, afterSecondRun);
        }
    }

    /// <summary>Everything a second, no-op run could disturb, compared as one value.</summary>
    private sealed record Snapshot(
        long DraftVersion,
        DateTimeOffset UpdatedAt,
        long[] PublicationVersions,
        long CurrentVersion,
        int OutboxCount,
        int MediaAssetCount,
        int RegularHourCount,
        int SpecialHourCount,
        int SocialLinkCount)
    {
        public bool Equals(Snapshot? other) =>
            other is not null &&
            (DraftVersion, UpdatedAt, CurrentVersion, OutboxCount, MediaAssetCount, RegularHourCount, SpecialHourCount, SocialLinkCount) ==
            (other.DraftVersion, other.UpdatedAt, other.CurrentVersion, other.OutboxCount, other.MediaAssetCount,
                other.RegularHourCount, other.SpecialHourCount, other.SocialLinkCount) &&
            PublicationVersions.SequenceEqual(other.PublicationVersions);

        public override int GetHashCode() => HashCode.Combine(DraftVersion, CurrentVersion, OutboxCount);
    }

    private static async Task<Snapshot> CaptureAsync(MenuDbContext db, RestaurantEntity restaurant)
    {
        var id = restaurant.Id;
        return new Snapshot(
            restaurant.DraftVersion,
            restaurant.UpdatedAt,
            await db.Publications.Where(item => item.RestaurantId == id).OrderBy(item => item.Version).Select(item => item.Version).ToArrayAsync(),
            await db.Publications.Where(item => item.RestaurantId == id && item.IsCurrent).Select(item => item.Version).SingleAsync(),
            await db.PublicationOutbox.CountAsync(item => item.RestaurantId == id),
            await db.MediaAssets.CountAsync(item => item.RestaurantId == id),
            restaurant.RegularHours.Count,
            restaurant.SpecialHours.Count,
            restaurant.SocialLinks.Count);
    }

    private static Task<RestaurantEntity> LoadAsync(MenuDbContext db) =>
        db.Restaurants.AsNoTracking()
            .Include(item => item.Address)
            .Include(item => item.RegularHours)
            .Include(item => item.SpecialHours)
            .Include(item => item.SocialLinks)
            .Include(item => item.Menus).ThenInclude(menu => menu.Categories).ThenInclude(category => category.Dishes)
            .AsSplitQuery()
            .SingleAsync(item => item.Id == GuardedSampleDataSeeder.OrdinaryRestaurantId);

    private static async Task RecreateLatestWithoutSeedAsync(MenuApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        await db.Database.EnsureDeletedAsync();
        await db.Database.MigrateAsync();
    }

    private static HttpClient CreatePublicClient(MenuApiFactory factory)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Host = "menu.localhost";
        return client;
    }

    private static IHostEnvironment Development(MenuApiFactory factory) =>
        new DevelopmentEnvironment(factory.Services.GetRequiredService<IHostEnvironment>());

    private static DateOnly WinnipegToday() => DateOnly.FromDateTime(
        TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("America/Winnipeg")).DateTime);

    /// <summary>The Testing host's own environment, renamed; content root and seed media stay the real ones.</summary>
    private sealed class DevelopmentEnvironment(IHostEnvironment inner) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = inner.ApplicationName;
        public string ContentRootPath { get; set; } = inner.ContentRootPath;
        public IFileProvider ContentRootFileProvider { get; set; } = inner.ContentRootFileProvider;
    }
}
