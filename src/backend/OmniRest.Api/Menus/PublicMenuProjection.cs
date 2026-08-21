using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Options;
using OmniRest.Api.Data;
using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Menus;

public sealed class PublicMenuOptions
{
    public const string SectionName = "PublicMenu";

    public Guid? DevelopmentDefaultRestaurantId { get; init; }
    public HashSet<string> AllowedMediaHosts { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class PublicMenuProjectionBuilder(
    IOptions<PublicMenuOptions> options,
    RestaurantPublicProjectionBuilder restaurantBuilder)
{
    private readonly IReadOnlySet<string> allowedMediaHosts = options.Value.AllowedMediaHosts;

    public PublicMenuResponse Build(
        RestaurantEntity restaurant,
        MenuEntity? menu,
        long version,
        string? websiteDesignId = null)
    {
        ArgumentNullException.ThrowIfNull(restaurant.Settings);
        if (restaurant.Settings.TaxDisplayMode is not ("inclusive" or "exclusive"))
        {
            throw new InvalidOperationException("Invalid tax display mode.");
        }

        var publicMenu = menu is null ? null : BuildMenu(restaurant.Id, menu);
        var resolvedDesignId = WebsiteDesignCatalog.ResolvePublished(
            websiteDesignId ?? restaurant.Settings.WebsiteDesignId);
        return new PublicMenuResponse(
            restaurant.Id.ToString("D", CultureInfo.InvariantCulture),
            restaurant.Name,
            restaurant.Settings.Locale,
            restaurant.Settings.Currency,
            restaurant.Settings.TaxDisplayMode,
            restaurant.Settings.TaxNoticeKey,
            version.ToString(CultureInfo.InvariantCulture),
            publicMenu,
            restaurantBuilder.Build(restaurant, version, resolvedDesignId),
            resolvedDesignId);
    }

    private PublicMenu BuildMenu(Guid restaurantId, MenuEntity menu)
    {
        if (menu.RestaurantId != restaurantId || !menu.IsActive)
        {
            throw new InvalidOperationException("Only the restaurant's active menu can be published.");
        }

        var dishIds = new HashSet<Guid>();
        var categories = menu.Categories
            .Where(category => category.IsActive)
            .OrderBy(category => category.DisplayOrder)
            .ThenBy(category => category.Id)
            .Select(category =>
            {
                if (category.RestaurantId != restaurantId || category.MenuId != menu.Id)
                {
                    throw new InvalidOperationException("Category ownership does not match the published menu.");
                }

                var dishes = category.Dishes
                    .Where(dish => dish.IsActive && dish.ArchivedAt is null)
                    .OrderBy(dish => dish.DisplayOrder)
                    .ThenBy(dish => dish.Id)
                    .Select(dish => BuildDish(restaurantId, menu.Id, category.Id, dishIds, dish))
                    .ToArray();

                return new PublicCategory(
                    category.Id.ToString("D", CultureInfo.InvariantCulture),
                    category.Slug,
                    category.Name,
                    category.Description,
                    dishes);
            })
            .ToArray();

        return new PublicMenu(menu.Id.ToString("D", CultureInfo.InvariantCulture), menu.Name, categories);
    }

    private PublicDish BuildDish(Guid restaurantId, Guid menuId, Guid categoryId, ISet<Guid> dishIds, DishEntity dish)
    {
        if (dish.RestaurantId != restaurantId || dish.MenuId != menuId || dish.CategoryId != categoryId)
        {
            throw new InvalidOperationException("Dish ownership does not match its category.");
        }

        if (!dishIds.Add(dish.Id))
        {
            throw new InvalidOperationException("A dish cannot appear more than once in a publication.");
        }

        if (dish.Price < 0 || decimal.Round(dish.Price, 2) != dish.Price)
        {
            throw new InvalidOperationException("Dish price must be a nonnegative two-decimal value.");
        }

        if (!AvailabilityStatus.IsValid(dish.Availability))
        {
            throw new InvalidOperationException("Dish availability is invalid.");
        }

        var badgeCodes = dish.Badges.Select(assignment => assignment.BadgeCode).ToArray();
        MenuValidation.ValidateBadgeAssignments(badgeCodes);
        var badges = dish.Badges
            .OrderBy(assignment => assignment.BadgeCode, StringComparer.Ordinal)
            .Select(assignment =>
            {
                if (assignment.RestaurantId != restaurantId || assignment.DishId != dish.Id ||
                    assignment.Badge.RestaurantId != restaurantId || assignment.Badge.Code != assignment.BadgeCode ||
                    !BadgeCatalog.TryGet(assignment.BadgeCode, out var definition) ||
                    assignment.Badge.LabelKey != definition.LabelKey || assignment.Badge.Category != definition.Category)
                {
                    throw new InvalidOperationException("Badge assignment is inconsistent with the badge catalog.");
                }

                return new PublicBadge(assignment.BadgeCode, definition.LabelKey, definition.Category);
            })
            .ToArray();

        PublicMedia? media = null;
        if (dish.MediaAsset is not null)
        {
            if (dish.MediaAsset.RestaurantId != restaurantId || dish.MediaAsset.Id != dish.MediaAssetId)
            {
                throw new InvalidOperationException("Media ownership does not match the dish.");
            }

            var variants = dish.MediaAsset.Variants
                .OrderBy(variant => variant.Width)
                .ThenBy(variant => variant.Height)
                .ThenBy(variant => variant.Id)
                .Select(variant =>
                {
                    if (variant.RestaurantId != restaurantId || variant.MediaAssetId != dish.MediaAsset.Id ||
                        variant.Width <= 0 || variant.Height <= 0 ||
                        !MenuValidation.IsSafeMediaUrl(variant.Url, allowedMediaHosts))
                    {
                        throw new InvalidOperationException("Media variant is invalid for public projection.");
                    }

                    return new PublicMediaVariant(variant.Url, variant.Width, variant.Height);
                })
                .ToArray();

            media = new PublicMedia(dish.MediaAsset.AltText, variants);
        }

        return new PublicDish(
            dish.Id.ToString("D", CultureInfo.InvariantCulture),
            dish.Name,
            dish.Description,
            dish.Price.ToString("0.00", CultureInfo.InvariantCulture),
            dish.Availability,
            media,
            badges);
    }
}

public sealed class PublicMenuSnapshotSerializer
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = false
    };

    public string Serialize(PublicMenuResponse response) => JsonSerializer.Serialize(response, Options);

    public PublicMenuResponse Deserialize(string json) =>
        JsonSerializer.Deserialize<PublicMenuResponse>(json, Options) ??
        throw new InvalidOperationException("Publication snapshot is empty or invalid.");
}
