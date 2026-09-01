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
    }

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
            Description = $"Description for {name}.",
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
