using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OmniRest.Api.Data;
using OmniRest.Api.Menus;
using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Infrastructure;

public static class GuardedSampleDataSeeder
{
    public static readonly Guid OrdinaryRestaurantId = Id("restaurant:ordinary");
    public static readonly Guid AlternateMediaAssetId = Guid.Parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    public static readonly Guid NoMenuRestaurantId = Id("restaurant:no-menu");
    public static readonly Guid NoActiveRestaurantId = Id("restaurant:no-active");
    public static readonly Guid ActiveEmptyRestaurantId = Id("restaurant:active-empty");
    public static readonly Guid AlternateRestaurantId = Id("restaurant:alternate");
    public static readonly Guid LargeRestaurantId = Id("restaurant:large");

    private static readonly DateTimeOffset SeedTime = new(2026, 7, 30, 12, 0, 0, TimeSpan.Zero);
    /// <summary>
    /// Seed media, mapped to the restaurant that owns it. Phase 7 serves media only from the owning
    /// restaurant's directory, so the fixture has to use the real per-tenant layout rather than a shared
    /// "seed" folder — otherwise the sample data would be the one thing the tenant check cannot express.
    /// </summary>
    private static readonly (string FileName, Guid RestaurantId)[] SeedMedia =
    [
        ("poutine-640.webp", OrdinaryRestaurantId),
        ("alternate-private.webp", AlternateRestaurantId)
    ];

    /// <summary>The public URL of a seeded media file, in the same shape <c>LocalMediaStorage</c> writes.</summary>
    private static string SeedMediaUrl(Guid restaurantId, string fileName) =>
        $"/media/uploads/{restaurantId:N}/{fileName}";

    public static async Task SeedAsync(IServiceProvider services, IHostEnvironment environment, bool large)
    {
        if (!environment.IsDevelopment() && !environment.IsEnvironment("Testing"))
        {
            throw new InvalidOperationException("Sample data is allowed only in Development or Testing.");
        }

        await CopySeedMediaAsync(services, environment);

        await using var scope = services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<MenuDbContext>();
        var builder = scope.ServiceProvider.GetRequiredService<PublicMenuProjectionBuilder>();
        var serializer = scope.ServiceProvider.GetRequiredService<PublicMenuSnapshotSerializer>();

        if (large)
        {
            if (!await dbContext.Restaurants.AnyAsync(item => item.Id == LargeRestaurantId))
            {
                AddLargeRestaurant(dbContext, builder, serializer);
                await dbContext.SaveChangesAsync();
            }

            return;
        }

        if (!await dbContext.Restaurants.AnyAsync(item => item.Id == OrdinaryRestaurantId))
        {
            AddOrdinaryRestaurant(dbContext, builder, serializer);
        }

        if (!await dbContext.Restaurants.AnyAsync(item => item.Id == NoMenuRestaurantId))
        {
            AddRestaurantWithoutPublication(dbContext);
        }

        if (!await dbContext.Restaurants.AnyAsync(item => item.Id == NoActiveRestaurantId))
        {
            AddNoActiveCategoriesRestaurant(dbContext, builder, serializer);
        }

        if (!await dbContext.Restaurants.AnyAsync(item => item.Id == ActiveEmptyRestaurantId))
        {
            AddActiveEmptyRestaurant(dbContext, builder, serializer);
        }

        if (!await dbContext.Restaurants.AnyAsync(item => item.Id == AlternateRestaurantId))
        {
            AddAlternateRestaurant(dbContext, builder, serializer);
        }

        await dbContext.SaveChangesAsync();

        // BUG-002: only Development gets the populated Prairie Table. Testing (the integration suite) keeps the
        // bare restaurant its assertions are written against — no address, no hours, no links, no images.
        if (environment.IsDevelopment())
        {
            await ApplyDevelopmentProfileAsync(scope.ServiceProvider, dbContext, builder, serializer);
        }
    }

    /// <summary>
    /// BUG-002: fills every still-empty public field of Prairie Table with realistic Winnipeg content and
    /// publishes the result, so a local stack renders every section of the public site instead of blanks.
    /// <para>
    /// It runs after the ordinary seed on both a fresh and an existing Development database, which makes one
    /// code path serve both: a fresh database gets the bare version 1 and then this enriched version 2; an
    /// existing one gets only its gaps filled. A field is filled only while it is null, empty or (for
    /// collections) has no entries, so anything an owner has edited is never overwritten. Special hours count
    /// as empty when none is dated today or later, because BUG-007 hides past dates and an expired entry
    /// would otherwise leave the section blank forever. Dish descriptions are replaced only while they still
    /// hold the seed's own <c>"Description for {name}."</c> placeholder.
    /// </para>
    /// <para>
    /// Publication goes through the same outbox row and <see cref="IInProcessPublicationDispatcher"/> an owner
    /// mutation uses, so ordering, supersession and cache eviction behave identically and the version stays
    /// monotonic. Nothing changed means nothing is written or published, so a second run is a no-op. The
    /// dispatch is always inline: <c>--seed-sample</c> exits before the outbox worker would ever start.
    /// </para>
    /// </summary>
    private static async Task ApplyDevelopmentProfileAsync(
        IServiceProvider scopedServices,
        MenuDbContext dbContext,
        PublicMenuProjectionBuilder builder,
        PublicMenuSnapshotSerializer serializer)
    {
        DevelopmentProfile.EnsureOwnerValidationAccepts();
        var now = scopedServices.GetRequiredService<TimeProvider>().GetUtcNow();

        dbContext.ChangeTracker.Clear();
        var restaurant = await RestaurantManagementService.AggregateQuery(dbContext)
            .SingleAsync(item => item.Id == OrdinaryRestaurantId);
        if (!await FillEmptyDevelopmentFieldsAsync(dbContext, restaurant, now))
        {
            return;
        }

        var operationId = Guid.NewGuid();
        await using (var transaction = await dbContext.Database.BeginTransactionAsync())
        {
            // Above both the draft and the live publication, exactly like an owner mutation, so the dispatcher
            // can never judge this version superseded and the public version number only ever goes up.
            var currentPublicationVersion = await dbContext.Publications.AsNoTracking()
                .Where(item => item.RestaurantId == restaurant.Id && item.IsCurrent)
                .Select(item => (long?)item.Version)
                .SingleOrDefaultAsync();
            restaurant.DraftVersion = Math.Max(restaurant.DraftVersion, currentPublicationVersion ?? 0) + 1;
            restaurant.ConcurrencyVersion++;
            restaurant.UpdatedAt = now;

            var menu = restaurant.Menus.SingleOrDefault(item => item.IsActive);
            dbContext.PublicationOutbox.Add(new PublicationOutboxEntity
            {
                OperationId = operationId,
                RestaurantId = restaurant.Id,
                Restaurant = restaurant,
                DraftVersion = restaurant.DraftVersion,
                DraftSnapshotJson = serializer.Serialize(builder.Build(restaurant, menu, restaurant.DraftVersion)),
                Status = PublicationStatuses.Pending,
                CreatedAt = now,
                UpdatedAt = now
            });
            await dbContext.SaveChangesAsync();
            await transaction.CommitAsync();
        }

        await scopedServices.GetRequiredService<IInProcessPublicationDispatcher>()
            .DispatchAsync(operationId, CancellationToken.None);
        var outcome = await dbContext.PublicationOutbox.AsNoTracking()
            .Where(item => item.OperationId == operationId)
            .Select(item => new { item.Status, item.ErrorCode })
            .SingleAsync();
        if (outcome.Status != PublicationStatuses.Succeeded)
        {
            throw new InvalidOperationException(
                $"The Development sample profile was saved but its publication did not succeed ({outcome.ErrorCode ?? outcome.Status}).");
        }
    }

    /// <summary>
    /// BUG-002: applies <see cref="DevelopmentProfile"/> to whichever fields are still empty and reports whether
    /// anything changed. Every new row is added to its set explicitly, as the management service does, because
    /// these entities carry client-assigned keys that change detection alone would mistake for existing rows.
    /// </summary>
    private static async Task<bool> FillEmptyDevelopmentFieldsAsync(
        MenuDbContext dbContext, RestaurantEntity restaurant, DateTimeOffset now)
    {
        var changed = false;

        if (string.IsNullOrWhiteSpace(restaurant.Description))
        {
            restaurant.Description = DevelopmentProfile.Description;
            changed = true;
        }
        if (string.IsNullOrWhiteSpace(restaurant.About))
        {
            restaurant.About = DevelopmentProfile.About;
            changed = true;
        }
        // The two phone fields are one value to the owner form (both or neither), so they are filled together.
        if (string.IsNullOrWhiteSpace(restaurant.PhoneE164) && string.IsNullOrWhiteSpace(restaurant.PhoneDisplay))
        {
            restaurant.PhoneE164 = DevelopmentProfile.PhoneE164;
            restaurant.PhoneDisplay = DevelopmentProfile.PhoneDisplay;
            changed = true;
        }
        if (string.IsNullOrWhiteSpace(restaurant.Email))
        {
            restaurant.Email = DevelopmentProfile.Email;
            changed = true;
        }
        if (string.IsNullOrEmpty(restaurant.RestaurantType))
        {
            restaurant.RestaurantType = DevelopmentProfile.RestaurantType;
            changed = true;
        }
        if (string.IsNullOrEmpty(restaurant.PriceRange))
        {
            restaurant.PriceRange = DevelopmentProfile.PriceRange;
            changed = true;
        }

        if (restaurant.Address is null)
        {
            var source = DevelopmentProfile.Address;
            var address = new RestaurantAddressEntity
            {
                RestaurantId = restaurant.Id,
                Restaurant = restaurant,
                Line1 = source.Line1,
                Line2 = source.Line2,
                City = source.City,
                Region = source.Region,
                PostalCode = source.PostalCode,
                CountryCode = source.CountryCode,
                Latitude = source.Latitude,
                Longitude = source.Longitude
            };
            restaurant.Address = address;
            dbContext.RestaurantAddresses.Add(address);
            changed = true;
        }

        if (restaurant.RegularHours.Count == 0)
        {
            foreach (var day in DevelopmentProfile.RegularHours)
            {
                var order = 0;
                foreach (var interval in day.Intervals)
                {
                    var added = new RegularHourIntervalEntity
                    {
                        Id = Guid.NewGuid(),
                        RestaurantId = restaurant.Id,
                        Restaurant = restaurant,
                        DayOfWeek = day.DayOfWeek,
                        OpensAt = TimeOnly.Parse(interval.OpensAt, System.Globalization.CultureInfo.InvariantCulture),
                        ClosesAt = TimeOnly.Parse(interval.ClosesAt, System.Globalization.CultureInfo.InvariantCulture),
                        DisplayOrder = order++
                    };
                    restaurant.RegularHours.Add(added);
                    dbContext.RegularHourIntervals.Add(added);
                }
            }
            changed = true;
        }

        var today = LocalDate(restaurant.Settings.TimeZoneId, now);
        if (!restaurant.SpecialHours.Any(item => item.Date >= today))
        {
            // Relative to the seeding clock, never a calendar constant, so the entry cannot expire in the
            // fixture itself. No existing entry is dated on or after today, so this date cannot collide.
            var special = new SpecialHourEntity
            {
                Id = Guid.NewGuid(),
                RestaurantId = restaurant.Id,
                Restaurant = restaurant,
                Date = today.AddDays(DevelopmentProfile.SpecialHoursDaysAhead),
                IsClosed = false,
                Note = DevelopmentProfile.SpecialHoursNote
            };
            var order = 0;
            foreach (var interval in DevelopmentProfile.SpecialHoursIntervals)
            {
                special.Intervals.Add(new SpecialHourIntervalEntity
                {
                    Id = Guid.NewGuid(),
                    RestaurantId = restaurant.Id,
                    SpecialHourId = special.Id,
                    SpecialHour = special,
                    OpensAt = TimeOnly.Parse(interval.OpensAt, System.Globalization.CultureInfo.InvariantCulture),
                    ClosesAt = TimeOnly.Parse(interval.ClosesAt, System.Globalization.CultureInfo.InvariantCulture),
                    DisplayOrder = order++
                });
            }
            restaurant.SpecialHours.Add(special);
            dbContext.SpecialHours.Add(special);
            changed = true;
        }

        if (restaurant.SocialLinks.Count == 0)
        {
            foreach (var link in DevelopmentProfile.SocialLinks)
            {
                var added = new SocialLinkEntity
                {
                    Id = Guid.NewGuid(),
                    RestaurantId = restaurant.Id,
                    Restaurant = restaurant,
                    Platform = link.Platform,
                    Url = link.Url
                };
                restaurant.SocialLinks.Add(added);
                dbContext.SocialLinks.Add(added);
            }
            changed = true;
        }

        if (restaurant.MainMediaAssetId is null)
        {
            // A deterministic id lets a later run reuse the asset if an owner cleared the slot, instead of
            // inserting a second copy. It points at the seed blob CopySeedMediaAsync already writes.
            var mainImageId = Id("ordinary:media:main");
            var mainImage = await dbContext.MediaAssets.Include(item => item.Variants)
                .SingleOrDefaultAsync(item => item.Id == mainImageId && item.RestaurantId == restaurant.Id);
            if (mainImage is null)
            {
                mainImage = new MediaAssetEntity
                {
                    Id = mainImageId,
                    RestaurantId = restaurant.Id,
                    Restaurant = restaurant,
                    AltText = DevelopmentProfile.MainImageAltText,
                    ProcessingStatus = "ready"
                };
                mainImage.Variants.Add(new MediaVariantEntity
                {
                    Id = Id("ordinary:media:main:640"),
                    RestaurantId = restaurant.Id,
                    MediaAssetId = mainImage.Id,
                    MediaAsset = mainImage,
                    Url = SeedMediaUrl(OrdinaryRestaurantId, "poutine-640.webp"),
                    Width = 640,
                    Height = 480
                });
                dbContext.MediaAssets.Add(mainImage);
            }
            restaurant.MainMediaAssetId = mainImage.Id;
            restaurant.MainMediaAsset = mainImage;
            changed = true;
        }

        foreach (var dish in restaurant.Menus.SelectMany(menu => menu.Categories).SelectMany(category => category.Dishes))
        {
            if (string.Equals(dish.Description, PlaceholderDishDescription(dish.Name), StringComparison.Ordinal) &&
                DevelopmentProfile.DishDescriptions.TryGetValue(dish.Name, out var description))
            {
                dish.Description = description;
                dish.UpdatedAt = now;
                changed = true;
            }
        }

        return changed;
    }

    private static DateOnly LocalDate(string timeZoneId, DateTimeOffset now)
    {
        try
        {
            return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, TimeZoneInfo.FindSystemTimeZoneById(timeZoneId)).DateTime);
        }
        catch (Exception exception) when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return DateOnly.FromDateTime(now.UtcDateTime);
        }
    }

    private static string PlaceholderDishDescription(string name) => $"Description for {name}.";

    private static void AddOrdinaryRestaurant(MenuDbContext dbContext, PublicMenuProjectionBuilder builder, PublicMenuSnapshotSerializer serializer)
    {
        var restaurant = NewRestaurant(OrdinaryRestaurantId, "Prairie Table", "menu.localhost", "en-CA", "CAD", "exclusive", "menu.tax.exclusive");
        var menu = NewMenu(restaurant, "All Day Menu");
        var slugs = new HashSet<string>(StringComparer.Ordinal);
        var starters = NewCategory(menu, "Starters", 0, slugs, "Small plates to begin.");
        var mains = NewCategory(menu, "Mains", 1, slugs, "Seasonal favourites.");
        NewCategory(menu, "Desserts", 2, slugs, "More coming soon.");
        NewCategory(menu, "Hidden", 3, slugs, active: false);

        var media = new MediaAssetEntity
        {
            Id = Id("ordinary:media:poutine"),
            RestaurantId = restaurant.Id,
            Restaurant = restaurant,
            AltText = "A bowl of prairie poutine"
        };
        media.Variants.Add(new MediaVariantEntity
        {
            Id = Id("ordinary:media:poutine:640"),
            RestaurantId = restaurant.Id,
            MediaAssetId = media.Id,
            MediaAsset = media,
            Url = SeedMediaUrl(OrdinaryRestaurantId, "poutine-640.webp"),
            Width = 640,
            Height = 480
        });

        var badges = AddBadges(dbContext, restaurant);
        var poutine = NewDish(starters, "Prairie Poutine", 12.50m, 0, AvailabilityStatus.Available, media: media);
        AssignBadges(poutine, badges, "vegetarian", "popular", "contains_nuts");
        var soup = NewDish(starters, "Roasted Tomato Soup", 8m, 1, AvailabilityStatus.Unavailable);
        AssignBadges(soup, badges, "vegan", "gluten_free", "dairy_free", "new");
        var chicken = NewDish(mains, "Spiced Chicken", 24.75m, 0, AvailabilityStatus.Available);
        AssignBadges(chicken, badges, "halal", "spicy");
        NewDish(mains, "Archived Plate", 15m, 1, AvailabilityStatus.Available, archived: true);
        NewDish(mains, "Inactive Plate", 16m, 2, AvailabilityStatus.Unavailable, active: false);

        dbContext.MediaAssets.Add(media);
        AddGallery(dbContext, restaurant);
        dbContext.Restaurants.Add(restaurant);
        AddPublication(dbContext, restaurant, menu, builder, serializer, 1);
    }

    /// <summary>
    /// Seeds a four-photo gallery, the last of which is inactive so the public active-only filter is
    /// visibly exercised. The rows reuse the seed blob that <see cref="CopySeedMediaAsync"/> already
    /// copies, so no new file is written; each photo still gets its own media asset because
    /// <c>(restaurant_id, media_asset_id)</c> is unique on the gallery table.
    /// </summary>
    private static void AddGallery(MenuDbContext dbContext, RestaurantEntity restaurant)
    {
        var photos = new (string AltText, string? Caption, bool Active)[]
        {
            ("The dining room at golden hour", "Golden hour in the dining room", true),
            ("The chef plating a prairie main", "Plating a prairie main", true),
            ("The bar with prairie spirits", null, true),
            ("The patio before opening", "Patio, coming next summer", false)
        };

        for (var index = 0; index < photos.Length; index++)
        {
            var (altText, caption, active) = photos[index];
            var asset = new MediaAssetEntity
            {
                Id = Id($"ordinary:gallery:asset:{index}"),
                RestaurantId = restaurant.Id,
                Restaurant = restaurant,
                AltText = altText,
                ProcessingStatus = "ready"
            };
            asset.Variants.Add(new MediaVariantEntity
            {
                Id = Id($"ordinary:gallery:variant:{index}"),
                RestaurantId = restaurant.Id,
                MediaAssetId = asset.Id,
                MediaAsset = asset,
                Url = SeedMediaUrl(OrdinaryRestaurantId, "poutine-640.webp"),
                Width = 640,
                Height = 480,
                StorageKey = null,
                FileSizeBytes = null
            });
            dbContext.MediaAssets.Add(asset);

            var galleryImage = new GalleryImageEntity
            {
                Id = Id($"ordinary:gallery:image:{index}"),
                RestaurantId = restaurant.Id,
                Restaurant = restaurant,
                MediaAssetId = asset.Id,
                MediaAsset = asset,
                Caption = caption,
                DisplayOrder = index + 1,
                IsActive = active,
                CreatedAt = SeedTime,
                UpdatedAt = SeedTime
            };
            restaurant.GalleryImages.Add(galleryImage);
            dbContext.GalleryImages.Add(galleryImage);
        }
    }

    private static void AddRestaurantWithoutPublication(MenuDbContext dbContext) =>
        dbContext.Restaurants.Add(NewRestaurant(NoMenuRestaurantId, "Coming Soon", "no-menu.localhost", "en-CA", "CAD", "inclusive", null));

    private static void AddNoActiveCategoriesRestaurant(MenuDbContext dbContext, PublicMenuProjectionBuilder builder, PublicMenuSnapshotSerializer serializer)
    {
        var restaurant = NewRestaurant(NoActiveRestaurantId, "Quiet Menu", "no-active.localhost", "en-CA", "CAD", "inclusive", null);
        var menu = NewMenu(restaurant, "Quiet Menu");
        var slugs = new HashSet<string>(StringComparer.Ordinal);
        var hidden = NewCategory(menu, "Hidden Category", 0, slugs, active: false);
        NewDish(hidden, "Hidden Dish", 10m, 0, AvailabilityStatus.Available);
        AddBadges(dbContext, restaurant);
        dbContext.Restaurants.Add(restaurant);
        AddPublication(dbContext, restaurant, menu, builder, serializer, 1);
    }

    private static void AddActiveEmptyRestaurant(MenuDbContext dbContext, PublicMenuProjectionBuilder builder, PublicMenuSnapshotSerializer serializer)
    {
        var restaurant = NewRestaurant(ActiveEmptyRestaurantId, "Empty Kitchen", "active-empty.localhost", "en-CA", "CAD", "inclusive", null);
        var menu = NewMenu(restaurant, "Empty Menu");
        NewCategory(menu, "Seasonal", 0, new HashSet<string>(StringComparer.Ordinal), "Check back soon.");
        AddBadges(dbContext, restaurant);
        dbContext.Restaurants.Add(restaurant);
        AddPublication(dbContext, restaurant, menu, builder, serializer, 1);
    }

    private static void AddAlternateRestaurant(MenuDbContext dbContext, PublicMenuProjectionBuilder builder, PublicMenuSnapshotSerializer serializer)
    {
        var restaurant = NewRestaurant(AlternateRestaurantId, "Café Boréal", "alternate.localhost", "fr-CA", "CAD", "inclusive", null);
        var menu = NewMenu(restaurant, "Menu du jour");
        var category = NewCategory(menu, "Plats", 0, new HashSet<string>(StringComparer.Ordinal));
        NewDish(category, "Tourtière", 19.25m, 0, AvailabilityStatus.Available);
        var privateMedia = new MediaAssetEntity
        {
            Id = AlternateMediaAssetId,
            RestaurantId = restaurant.Id,
            Restaurant = restaurant,
            AltText = "Alternate tenant private image",
            ProcessingStatus = "ready"
        };
        privateMedia.Variants.Add(new MediaVariantEntity
        {
            Id = Id("alternate:media:private:640"),
            RestaurantId = restaurant.Id,
            MediaAssetId = privateMedia.Id,
            MediaAsset = privateMedia,
            Url = SeedMediaUrl(AlternateRestaurantId, "alternate-private.webp"),
            Width = 640,
            Height = 480
        });
        dbContext.MediaAssets.Add(privateMedia);
        AddBadges(dbContext, restaurant);
        dbContext.Restaurants.Add(restaurant);
        AddPublication(dbContext, restaurant, menu, builder, serializer, 3);
    }

    private static async Task CopySeedMediaAsync(IServiceProvider services, IHostEnvironment environment)
    {
        var storage = services.GetRequiredService<IOptions<LocalMediaStorageOptions>>().Value;
        var mediaRoot = storage.LocalRoot ?? throw new InvalidOperationException("Seed media requires a configured local media root.");
        var sourceRoot = Path.Combine(environment.ContentRootPath, "seed-media");
        foreach (var (fileName, restaurantId) in SeedMedia)
        {
            // One directory per owning restaurant, matching LocalMediaStorage's real layout so the
            // Phase 7 tenant check applies to seeded media exactly as it does to uploads.
            var destinationRoot = Path.Combine(mediaRoot, restaurantId.ToString("N"));
            Directory.CreateDirectory(destinationRoot);
            var sourcePath = Path.Combine(sourceRoot, fileName);
            if (!File.Exists(sourcePath))
            {
                throw new FileNotFoundException("A required seed media file is missing.", sourcePath);
            }

            var destinationPath = Path.Combine(destinationRoot, fileName);
            await using var source = new FileStream(
                sourcePath, FileMode.Open, FileAccess.Read, FileShare.Read, bufferSize: 81920, useAsync: true);
            await using var destination = new FileStream(
                destinationPath, FileMode.Create, FileAccess.Write, FileShare.None, bufferSize: 81920, useAsync: true);
            await source.CopyToAsync(destination);
        }
    }

    private static void AddLargeRestaurant(MenuDbContext dbContext, PublicMenuProjectionBuilder builder, PublicMenuSnapshotSerializer serializer)
    {
        var restaurant = NewRestaurant(LargeRestaurantId, "Large Fixture", "large-menu.localhost", "en-CA", "CAD", "inclusive", null);
        var menu = NewMenu(restaurant, "Reference Large Menu");
        var badges = AddBadges(dbContext, restaurant);
        var slugs = new HashSet<string>(StringComparer.Ordinal);
        var dishNumber = 0;
        for (var categoryNumber = 0; categoryNumber < 30; categoryNumber++)
        {
            var category = NewCategory(menu, $"Category {categoryNumber + 1}", categoryNumber, slugs);
            var count = categoryNumber < 10 ? 34 : 33;
            for (var index = 0; index < count; index++)
            {
                var dish = NewDish(
                    category,
                    $"Dish {dishNumber + 1}",
                    5m + (dishNumber % 100) / 4m,
                    index,
                    dishNumber % 11 == 0 ? AvailabilityStatus.Unavailable : AvailabilityStatus.Available);
                if (dishNumber % 7 == 0)
                {
                    AssignBadges(dish, badges, "popular");
                }

                dishNumber++;
            }
        }

        if (dishNumber != 1000)
        {
            throw new InvalidOperationException("Large fixture must contain exactly 1,000 dishes.");
        }

        dbContext.Restaurants.Add(restaurant);
        AddPublication(dbContext, restaurant, menu, builder, serializer, 1);
    }

    private static RestaurantEntity NewRestaurant(
        Guid id, string name, string host, string locale, string currency, string taxMode, string? taxNoticeKey)
    {
        var restaurant = new RestaurantEntity
        {
            Id = id,
            Name = name,
            // Every sample host is "<label>.localhost", so the leading label doubles as the slug and
            // gives the Phase 7 subdomain strategy something real to resolve against in development.
            Slug = host.Split('.')[0],
            CreatedAt = SeedTime,
            UpdatedAt = SeedTime,
            Settings = new RestaurantSettingsEntity
            {
                RestaurantId = id,
                Locale = locale,
                Currency = currency,
                TaxDisplayMode = taxMode,
                TaxNoticeKey = taxNoticeKey
            }
        };
        restaurant.Settings.Restaurant = restaurant;
        restaurant.Domains.Add(new RestaurantDomainEntity
        {
            Id = Id($"domain:{host}"),
            RestaurantId = id,
            Restaurant = restaurant,
            Host = host
        });
        return restaurant;
    }

    private static MenuEntity NewMenu(RestaurantEntity restaurant, string name)
    {
        var menu = new MenuEntity
        {
            Id = Id($"menu:{restaurant.Id:N}"),
            RestaurantId = restaurant.Id,
            Restaurant = restaurant,
            Name = name,
            IsActive = true,
            CreatedAt = SeedTime,
            UpdatedAt = SeedTime
        };
        restaurant.Menus.Add(menu);
        return menu;
    }

    private static MenuCategoryEntity NewCategory(
        MenuEntity menu, string name, int order, ISet<string> slugs, string? description = null, bool active = true)
    {
        var category = new MenuCategoryEntity
        {
            Id = Id($"category:{menu.Id:N}:{order}"),
            RestaurantId = menu.RestaurantId,
            MenuId = menu.Id,
            Menu = menu,
            Name = name,
            Description = description,
            DisplayOrder = order,
            IsActive = active,
            CreatedAt = SeedTime,
            UpdatedAt = SeedTime
        };
        category.Slug = MenuValidation.CreateSlug(name, category.Id, slugs);
        menu.Categories.Add(category);
        return category;
    }

    private static DishEntity NewDish(
        MenuCategoryEntity category,
        string name,
        decimal price,
        int order,
        string availability,
        MediaAssetEntity? media = null,
        bool active = true,
        bool archived = false)
    {
        var dish = new DishEntity
        {
            Id = Id($"dish:{category.Id:N}:{order}"),
            RestaurantId = category.RestaurantId,
            MenuId = category.MenuId,
            CategoryId = category.Id,
            Category = category,
            Name = name,
            Description = PlaceholderDishDescription(name),
            Price = price,
            MediaAssetId = media?.Id,
            MediaAsset = media,
            Availability = availability,
            IsActive = active,
            DisplayOrder = order,
            ArchivedAt = archived ? SeedTime : null,
            CreatedAt = SeedTime,
            UpdatedAt = SeedTime
        };
        category.Dishes.Add(dish);
        return dish;
    }

    private static Dictionary<string, BadgeEntity> AddBadges(MenuDbContext dbContext, RestaurantEntity restaurant)
    {
        var result = new Dictionary<string, BadgeEntity>(StringComparer.Ordinal);
        foreach (var code in BadgeCatalog.Codes)
        {
            BadgeCatalog.TryGet(code, out var definition);
            var badge = new BadgeEntity
            {
                RestaurantId = restaurant.Id,
                Restaurant = restaurant,
                Code = code,
                LabelKey = definition.LabelKey,
                Category = definition.Category
            };
            result.Add(code, badge);
            dbContext.Badges.Add(badge);
        }

        return result;
    }

    private static void AssignBadges(DishEntity dish, IReadOnlyDictionary<string, BadgeEntity> badges, params string[] codes)
    {
        MenuValidation.ValidateBadgeAssignments(codes);
        foreach (var code in codes)
        {
            dish.Badges.Add(new DishBadgeEntity
            {
                RestaurantId = dish.RestaurantId,
                DishId = dish.Id,
                BadgeCode = code,
                Dish = dish,
                Badge = badges[code]
            });
        }
    }

    private static void AddPublication(
        MenuDbContext dbContext,
        RestaurantEntity restaurant,
        MenuEntity menu,
        PublicMenuProjectionBuilder builder,
        PublicMenuSnapshotSerializer serializer,
        long version)
    {
        restaurant.DraftVersion = Math.Max(restaurant.DraftVersion, version);
        var response = builder.Build(restaurant, menu, version);
        var publication = new PublicationEntity
        {
            Id = Id($"publication:{restaurant.Id:N}:{version}"),
            RestaurantId = restaurant.Id,
            Restaurant = restaurant,
            Version = version,
            SnapshotJson = serializer.Serialize(response),
            IsCurrent = true,
            PublishedAt = SeedTime
        };
        restaurant.Publications.Add(publication);
        dbContext.Publications.Add(publication);
    }

    /// <summary>
    /// BUG-002: the Development-only content for Prairie Table. It is expressed in the owner API's own request
    /// shapes so <see cref="EnsureOwnerValidationAccepts"/> can hold it to exactly the rules an owner's save is
    /// held to; sample data an owner could not have entered would hide bugs rather than expose them. Copy
    /// deliberately avoids words the public renderers must never show for features this product lacks.
    /// </summary>
    public static class DevelopmentProfile
    {
        public const string Description =
            "A neighbourhood kitchen near The Forks serving Manitoba-grown comfort food: pickerel, perogies, " +
            "bannock and our signature prairie poutine, in a warm and unhurried dining room.";

        public static readonly string About = string.Join("\n\n",
            "Prairie Table opened in a restored brick warehouse near The Forks with one simple idea: cook the food " +
            "we grew up eating on the prairies, and cook it well. The menu follows Manitoba's seasons, from spring " +
            "fiddleheads to the root vegetables that carry us through January.",
            "We buy directly from farms within a few hours of Winnipeg: Red River Valley grains, Interlake beef, " +
            "pickerel from Lake Winnipeg and whatever our growers bring to the back door that week. Bread, pickles " +
            "and preserves are made in-house, and the kitchen is always happy to adapt a dish for dietary needs.",
            "Whether you drop in for a weekday lunch, a long Saturday supper or Sunday brunch with the family, we " +
            "want the room to feel like a neighbour's kitchen: unhurried, generous and a little bit loud. Walk-ins " +
            "are always welcome.");

        public const string PhoneE164 = "+12045550123";
        public const string PhoneDisplay = "(204) 555-0123";
        public const string Email = "hello@prairietable.example";
        public const string RestaurantType = "Restaurant";
        public const string PriceRange = "$$";
        public const string MainImageAltText = "A bowl of prairie poutine with cheese curds and mushroom gravy";

        public static readonly AdminAddressRequest Address = new(
            "200 Main Street", null, "Winnipeg", "MB", "R3C 1A8", "CA", 49.8951m, -97.1384m);

        /// <summary>
        /// Day 0 is Sunday. Closed Monday; Tuesday is a split shift; Saturday is split and its evening runs past
        /// midnight, so both the multi-interval and the closes-next-day displays are exercised.
        /// </summary>
        public static readonly IReadOnlyList<AdminRegularHoursDayRequest> RegularHours =
        [
            new(0, [new("10:00", "15:00")]),
            new(1, []),
            new(2, [new("11:00", "14:00"), new("17:00", "21:00")]),
            new(3, [new("11:00", "21:00")]),
            new(4, [new("11:00", "21:00")]),
            new(5, [new("11:00", "23:00")]),
            new(6, [new("10:00", "14:30"), new("17:00", "01:00")])
        ];

        public const int SpecialHoursDaysAhead = 30;
        public const string SpecialHoursNote = "Early close for our staff appreciation supper";
        public static readonly IReadOnlyList<AdminHourIntervalRequest> SpecialHoursIntervals = [new("11:00", "16:00")];

        /// <summary>The Facebook URL is the exact ID-style profile link from BUG-006, on purpose.</summary>
        public static readonly IReadOnlyList<AdminSocialLinkRequest> SocialLinks =
        [
            new("facebook", "https://www.facebook.com/profile.php?id=100073564902779"),
            new("instagram", "https://www.instagram.com/prairietable")
        ];

        /// <summary>Keyed by dish name; the names themselves are fixed because the e2e suite looks them up.</summary>
        public static readonly IReadOnlyDictionary<string, string> DishDescriptions =
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["Prairie Poutine"] =
                    "Hand-cut fries and Manitoba cheese curds under a rich mushroom gravy, finished with toasted hazelnuts and chives.",
                ["Roasted Tomato Soup"] =
                    "Slow-roasted tomatoes and red peppers blended with olive oil and fresh basil, topped with toasted pumpkin seeds.",
                ["Spiced Chicken"] =
                    "Halal chicken thighs marinated in chili, cumin and garlic, grilled over high heat and served with wild rice pilaf and charred corn.",
                ["Archived Plate"] = "A retired winter special, kept on file for next season.",
                ["Inactive Plate"] = "A test-kitchen plate that is not on the menu yet."
            };

        /// <summary>Throws if any part of the profile would be refused by the owner API's validation.</summary>
        public static void EnsureOwnerValidationAccepts()
        {
            var failures = RestaurantValidation.ValidateProfile(new UpdateRestaurantProfileRequest(
                    "Prairie Table", Description, PhoneE164, PhoneDisplay, Email, "America/Winnipeg", Address,
                    RestaurantType, PriceRange, WebsiteUrl: null, About: About))
                .Concat(RestaurantValidation.ValidateRegularHours(new UpdateRegularHoursRequest(RegularHours)))
                .Concat(RestaurantValidation.ValidateSpecialHours(
                    new AdminSpecialHoursRequest("2030-01-01", false, SpecialHoursNote, SpecialHoursIntervals)))
                .Concat(RestaurantValidation.ValidateSocialLinks(new UpdateSocialLinksRequest(SocialLinks)))
                .Select(item => $"{item.Key}: {string.Join(',', item.Value)}")
                .ToArray();
            if (DishDescriptions.Values.Any(value => value.Length > 1000))
            {
                failures = [.. failures, "dishes.description: field_length_invalid"];
            }
            if (failures.Length > 0)
            {
                throw new InvalidOperationException(
                    $"The Development sample profile fails owner validation: {string.Join("; ", failures)}");
            }
        }
    }

    internal static Guid Id(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        Span<byte> guidBytes = stackalloc byte[16];
        bytes.AsSpan(0, 16).CopyTo(guidBytes);
        guidBytes[7] = (byte)((guidBytes[7] & 0x0F) | 0x50);
        guidBytes[8] = (byte)((guidBytes[8] & 0x3F) | 0x80);
        return new Guid(guidBytes);
    }
}
