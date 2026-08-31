using Microsoft.EntityFrameworkCore;
using OmniRest.Api.Data;
using OmniRest.Api.Menus;
using OmniRest.Api.Security;

namespace OmniRest.Api.Restaurants;

public sealed partial class RestaurantManagementService
{
    public Task<ManagementResult<AdminMenuMutationResponse>> CreateDishAsync(
        OwnerRestaurantAccess access,
        string? etag,
        CreateDishRequest request,
        CancellationToken cancellationToken) => MutateMenuAsync(access, etag, "menu.dish.created", async (menu, now, audit) =>
    {
        var category = menu.Categories.SingleOrDefault(item => item.Id == request.CategoryId);
        if (category is null)
        {
            return CategoryNotFound();
        }

        var media = await ResolveMediaAsync(menu.RestaurantId, request.MediaAssetId, cancellationToken);
        if (media.Failure is not null)
        {
            return media.Failure;
        }

        var dish = new DishEntity
        {
            Id = Guid.NewGuid(),
            RestaurantId = menu.RestaurantId,
            MenuId = menu.Id,
            CategoryId = category.Id,
            Category = category,
            Name = request.Name.Trim(),
            Description = NormalizeOptional(request.Description),
            Price = request.Price,
            MediaAssetId = media.Asset?.Id,
            MediaAsset = media.Asset,
            Availability = request.Availability ?? AvailabilityStatus.Available,
            IsActive = true,
            DisplayOrder = NextDishOrder(category),
            CreatedAt = now,
            UpdatedAt = now
        };
        category.Dishes.Add(dish);
        dbContext.Dishes.Add(dish);

        var badges = await ApplyBadgesAsync(dish, request.Badges, cancellationToken);
        if (badges is not null)
        {
            return badges;
        }

        audit.EntityType = "dish";
        audit.EntityId = dish.Id;
        return null;
    }, cancellationToken);

    public Task<ManagementResult<AdminMenuMutationResponse>> UpdateDishAsync(
        OwnerRestaurantAccess access,
        Guid dishId,
        string? etag,
        UpdateDishRequest request,
        CancellationToken cancellationToken) => MutateMenuAsync(access, etag, "menu.dish.updated", async (menu, now, audit) =>
    {
        var dish = FindDish(menu, dishId);
        if (dish is null)
        {
            return DishNotFound();
        }
        var target = menu.Categories.SingleOrDefault(item => item.Id == request.CategoryId);
        if (target is null)
        {
            return CategoryNotFound();
        }

        var media = await ResolveMediaAsync(menu.RestaurantId, request.MediaAssetId, cancellationToken);
        if (media.Failure is not null)
        {
            return media.Failure;
        }

        if (dish.CategoryId != target.Id)
        {
            var source = menu.Categories.Single(item => item.Id == dish.CategoryId);
            source.Dishes.Remove(dish);
            dish.CategoryId = target.Id;
            dish.Category = target;
            dish.DisplayOrder = NextDishOrder(target);
            target.Dishes.Add(dish);
        }

        dish.Name = request.Name.Trim();
        dish.Description = NormalizeOptional(request.Description);
        dish.Price = request.Price;
        dish.MediaAssetId = media.Asset?.Id;
        dish.MediaAsset = media.Asset;
        dish.Availability = request.Availability ?? dish.Availability;
        Touch(dish, now);

        var badges = await ApplyBadgesAsync(dish, request.Badges, cancellationToken);
        if (badges is not null)
        {
            return badges;
        }

        audit.EntityType = "dish";
        audit.EntityId = dish.Id;
        return null;
    }, cancellationToken);

    public Task<ManagementResult<AdminMenuMutationResponse>> UpdateDishPriceAsync(
        OwnerRestaurantAccess access,
        Guid dishId,
        string? etag,
        UpdateDishPriceRequest request,
        CancellationToken cancellationToken) => MutateMenuAsync(access, etag, "menu.dish.price_changed", (menu, now, audit) =>
    {
        var dish = FindDish(menu, dishId);
        if (dish is null)
        {
            return Task.FromResult<ManagementFailure?>(DishNotFound());
        }
        dish.Price = request.Price;
        Touch(dish, now);
        audit.EntityType = "dish";
        audit.EntityId = dish.Id;
        return Task.FromResult<ManagementFailure?>(null);
    }, cancellationToken);

    public Task<ManagementResult<AdminMenuMutationResponse>> UpdateDishAvailabilityAsync(
        OwnerRestaurantAccess access,
        Guid dishId,
        string? etag,
        UpdateDishAvailabilityRequest request,
        CancellationToken cancellationToken) => MutateMenuAsync(access, etag, "menu.dish.availability_changed", (menu, now, audit) =>
    {
        var dish = FindDish(menu, dishId);
        if (dish is null)
        {
            return Task.FromResult<ManagementFailure?>(DishNotFound());
        }
        // Availability changes visibility only: price, category, media, description, and badges are untouched.
        dish.Availability = request.Status;
        Touch(dish, now);
        audit.EntityType = "dish";
        audit.EntityId = dish.Id;
        return Task.FromResult<ManagementFailure?>(null);
    }, cancellationToken);

    public Task<ManagementResult<AdminMenuMutationResponse>> DeleteDishAsync(
        OwnerRestaurantAccess access,
        Guid dishId,
        string? etag,
        CancellationToken cancellationToken) => MutateMenuAsync(access, etag, "menu.dish.deleted", async (menu, now, audit) =>
    {
        var dish = FindDish(menu, dishId);
        if (dish is null)
        {
            return DishNotFound();
        }
        // Soft delete: the row stays for audit and reporting, but leaves every menu projection.
        dish.ArchivedAt = now;
        dish.IsActive = false;
        Touch(dish, now);

        var category = menu.Categories.Single(item => item.Id == dish.CategoryId);
        var restacked = await RestackAsync(category, null, now, cancellationToken);
        if (restacked is not null)
        {
            return restacked;
        }

        audit.EntityType = "dish";
        audit.EntityId = dish.Id;
        return null;
    }, cancellationToken);

    public Task<ManagementResult<AdminMenuMutationResponse>> ReorderDishesAsync(
        OwnerRestaurantAccess access,
        string? etag,
        ReorderDishesRequest request,
        CancellationToken cancellationToken) => MutateMenuAsync(access, etag, "menu.dishes.reordered", async (menu, now, audit) =>
    {
        var category = menu.Categories.SingleOrDefault(item => item.Id == request.CategoryId);
        if (category is null)
        {
            return CategoryNotFound();
        }
        var live = category.Dishes.Where(dish => dish.ArchivedAt is null).ToDictionary(dish => dish.Id);
        if (request.DishIds.Count != live.Count || request.DishIds.Any(id => !live.ContainsKey(id)))
        {
            return new ManagementFailure(400, "admin_validation", "Validation failed", Errors:
                new Dictionary<string, string[]>(StringComparer.Ordinal) { ["dishIds"] = ["dish_reorder_incomplete"] });
        }

        var restacked = await RestackAsync(category, request.DishIds.Select(id => live[id]).ToArray(), now, cancellationToken);
        if (restacked is not null)
        {
            return restacked;
        }

        audit.EntityType = "menu_category";
        audit.EntityId = category.Id;
        return null;
    }, cancellationToken);

    /// <summary>
    /// Rewrites every dish order in one category so live dishes occupy a contiguous range in the requested
    /// order and archived dishes sit above them, keeping the (category_id, display_order) unique index valid.
    /// </summary>
    private async Task<ManagementFailure?> RestackAsync(
        MenuCategoryEntity category,
        IReadOnlyList<DishEntity>? liveOrder,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var live = liveOrder ?? category.Dishes
            .Where(dish => dish.ArchivedAt is null)
            .OrderBy(dish => dish.DisplayOrder).ThenBy(dish => dish.Id).ToArray();
        var archived = category.Dishes
            .Where(dish => dish.ArchivedAt is not null)
            .OrderBy(dish => dish.ArchivedAt).ThenBy(dish => dish.Id).ToArray();
        var ordered = live.Concat(archived).ToArray();
        if (ordered.Length == 0)
        {
            return null;
        }

        var stagingOffset = category.Dishes.Max(dish => dish.DisplayOrder) + 1;
        for (var index = 0; index < ordered.Length; index++)
        {
            ordered[index].DisplayOrder = stagingOffset + index;
        }
        var staged = await StageAsync(cancellationToken);
        if (staged is not null)
        {
            return staged;
        }

        for (var index = 0; index < ordered.Length; index++)
        {
            ordered[index].DisplayOrder = index;
            Touch(ordered[index], now);
        }
        return null;
    }

    private async Task<(MediaAssetEntity? Asset, ManagementFailure? Failure)> ResolveMediaAsync(
        Guid restaurantId,
        Guid? mediaAssetId,
        CancellationToken cancellationToken)
    {
        if (mediaAssetId is null)
        {
            return (null, null);
        }
        var asset = await dbContext.MediaAssets
            .Include(item => item.Variants)
            .SingleOrDefaultAsync(item => item.Id == mediaAssetId && item.RestaurantId == restaurantId, cancellationToken);
        if (asset is null)
        {
            return (null, new ManagementFailure(404, "media_asset_not_found", "Image not found"));
        }
        if (!string.Equals(asset.ProcessingStatus, "ready", StringComparison.Ordinal))
        {
            return (null, new ManagementFailure(409, "media_asset_not_ready", "Image is still processing"));
        }
        return (asset, null);
    }

    /// <summary>
    /// Replaces a dish's dietary and promotional flags, creating any tenant badge rows the catalog defines.
    /// </summary>
    private async Task<ManagementFailure?> ApplyBadgesAsync(
        DishEntity dish,
        IReadOnlyList<string>? codes,
        CancellationToken cancellationToken)
    {
        if (codes is null)
        {
            return null;
        }

        dbContext.DishBadges.RemoveRange(dish.Badges.ToArray());
        dish.Badges.Clear();
        if (codes.Count == 0)
        {
            return null;
        }

        var existing = await dbContext.Badges
            .Where(item => item.RestaurantId == dish.RestaurantId)
            .ToDictionaryAsync(item => item.Code, StringComparer.Ordinal, cancellationToken);
        foreach (var code in codes)
        {
            if (!BadgeCatalog.TryGet(code, out var definition))
            {
                return new ManagementFailure(400, "admin_validation", "Validation failed", Errors:
                    new Dictionary<string, string[]>(StringComparer.Ordinal) { ["badges"] = ["badge_unknown"] });
            }
            if (!existing.TryGetValue(code, out var badge))
            {
                badge = new BadgeEntity
                {
                    RestaurantId = dish.RestaurantId,
                    Code = code,
                    LabelKey = definition.LabelKey,
                    Category = definition.Category
                };
                dbContext.Badges.Add(badge);
                existing[code] = badge;
            }
            var assignment = new DishBadgeEntity
            {
                RestaurantId = dish.RestaurantId,
                DishId = dish.Id,
                BadgeCode = code,
                Dish = dish,
                Badge = badge
            };
            dish.Badges.Add(assignment);
            dbContext.DishBadges.Add(assignment);
        }
        return null;
    }

    private static DishEntity? FindDish(MenuEntity menu, Guid dishId) => menu.Categories
        .SelectMany(category => category.Dishes)
        .SingleOrDefault(dish => dish.Id == dishId && dish.ArchivedAt is null);

    private static int NextDishOrder(MenuCategoryEntity category) =>
        category.Dishes.Count == 0 ? 0 : category.Dishes.Max(dish => dish.DisplayOrder) + 1;

    private static void Touch(DishEntity dish, DateTimeOffset now)
    {
        dish.UpdatedAt = now;
        dish.ConcurrencyVersion++;
    }
}
