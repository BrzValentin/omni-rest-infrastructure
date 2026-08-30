using System.Globalization;
using Microsoft.EntityFrameworkCore;
using OmniRest.Api.Data;
using OmniRest.Api.Menus;
using OmniRest.Api.Security;

namespace OmniRest.Api.Restaurants;

internal sealed record MutationOutcome(RestaurantEntity Restaurant, PublicationStatusResponse Publication);

/// <summary>
/// Identifies the specific entity a mutation changed so the audit record can name it.
/// </summary>
internal sealed class MutationAudit
{
    public string EntityType { get; set; } = "restaurant";
    public Guid? EntityId { get; set; }
}

public interface IMenuManagementService
{
    Task<ManagementResult<AdminMenuResponse>> ReadMenuAsync(
        OwnerRestaurantAccess access, CancellationToken cancellationToken);

    Task<ManagementResult<AdminMenuMutationResponse>> CreateCategoryAsync(
        OwnerRestaurantAccess access, string? etag, CreateMenuCategoryRequest request, CancellationToken cancellationToken);

    Task<ManagementResult<AdminMenuMutationResponse>> UpdateCategoryAsync(
        OwnerRestaurantAccess access, Guid categoryId, string? etag, UpdateMenuCategoryRequest request, CancellationToken cancellationToken);

    Task<ManagementResult<AdminMenuMutationResponse>> DeleteCategoryAsync(
        OwnerRestaurantAccess access, Guid categoryId, string? etag, CancellationToken cancellationToken);

    Task<ManagementResult<AdminMenuMutationResponse>> ReorderCategoriesAsync(
        OwnerRestaurantAccess access, string? etag, ReorderMenuCategoriesRequest request, CancellationToken cancellationToken);

    Task<ManagementResult<AdminMenuMutationResponse>> CreateDishAsync(
        OwnerRestaurantAccess access, string? etag, CreateDishRequest request, CancellationToken cancellationToken);

    Task<ManagementResult<AdminMenuMutationResponse>> UpdateDishAsync(
        OwnerRestaurantAccess access, Guid dishId, string? etag, UpdateDishRequest request, CancellationToken cancellationToken);

    Task<ManagementResult<AdminMenuMutationResponse>> UpdateDishPriceAsync(
        OwnerRestaurantAccess access, Guid dishId, string? etag, UpdateDishPriceRequest request, CancellationToken cancellationToken);

    Task<ManagementResult<AdminMenuMutationResponse>> UpdateDishAvailabilityAsync(
        OwnerRestaurantAccess access, Guid dishId, string? etag, UpdateDishAvailabilityRequest request, CancellationToken cancellationToken);

    Task<ManagementResult<AdminMenuMutationResponse>> DeleteDishAsync(
        OwnerRestaurantAccess access, Guid dishId, string? etag, CancellationToken cancellationToken);

    Task<ManagementResult<AdminMenuMutationResponse>> ReorderDishesAsync(
        OwnerRestaurantAccess access, string? etag, ReorderDishesRequest request, CancellationToken cancellationToken);
}

public sealed partial class RestaurantManagementService : IMenuManagementService
{
    public async Task<ManagementResult<AdminMenuResponse>> ReadMenuAsync(
        OwnerRestaurantAccess access,
        CancellationToken cancellationToken)
    {
        var restaurant = await LoadAggregateAsync(access.RestaurantId, tracking: false, cancellationToken);
        return restaurant is null
            ? ManagementResult<AdminMenuResponse>.Failed(NotFound())
            : ManagementResult<AdminMenuResponse>.Success(await ToAdminMenuAsync(restaurant, cancellationToken));
    }

    public Task<ManagementResult<AdminMenuMutationResponse>> CreateCategoryAsync(
        OwnerRestaurantAccess access,
        string? etag,
        CreateMenuCategoryRequest request,
        CancellationToken cancellationToken) => MutateMenuAsync(access, etag, "menu.category.created", (menu, now, audit) =>
    {
        var slugs = menu.Categories.Select(item => item.Slug).ToHashSet(StringComparer.Ordinal);
        var id = Guid.NewGuid();
        var category = new MenuCategoryEntity
        {
            Id = id,
            RestaurantId = menu.RestaurantId,
            MenuId = menu.Id,
            Menu = menu,
            Name = request.Name.Trim(),
            Description = NormalizeOptional(request.Description),
            Slug = MenuValidation.CreateSlug(request.Name.Trim(), id, slugs),
            DisplayOrder = menu.Categories.Count == 0 ? 0 : menu.Categories.Max(item => item.DisplayOrder) + 1,
            IsActive = true,
            CreatedAt = now,
            UpdatedAt = now
        };
        menu.Categories.Add(category);
        dbContext.MenuCategories.Add(category);
        audit.EntityType = "menu_category";
        audit.EntityId = category.Id;
        return Task.FromResult<ManagementFailure?>(null);
    }, cancellationToken);

    public Task<ManagementResult<AdminMenuMutationResponse>> UpdateCategoryAsync(
        OwnerRestaurantAccess access,
        Guid categoryId,
        string? etag,
        UpdateMenuCategoryRequest request,
        CancellationToken cancellationToken) => MutateMenuAsync(access, etag, "menu.category.updated", (menu, now, audit) =>
    {
        var category = menu.Categories.SingleOrDefault(item => item.Id == categoryId);
        if (category is null)
        {
            return Task.FromResult<ManagementFailure?>(CategoryNotFound());
        }
        category.Name = request.Name.Trim();
        category.Description = NormalizeOptional(request.Description);
        category.UpdatedAt = now;
        category.ConcurrencyVersion++;
        audit.EntityType = "menu_category";
        audit.EntityId = category.Id;
        return Task.FromResult<ManagementFailure?>(null);
    }, cancellationToken);

    public Task<ManagementResult<AdminMenuMutationResponse>> DeleteCategoryAsync(
        OwnerRestaurantAccess access,
        Guid categoryId,
        string? etag,
        CancellationToken cancellationToken) => MutateMenuAsync(access, etag, "menu.category.deleted", (menu, _, audit) =>
    {
        var category = menu.Categories.SingleOrDefault(item => item.Id == categoryId);
        if (category is null)
        {
            return Task.FromResult<ManagementFailure?>(CategoryNotFound());
        }
        if (category.Dishes.Any(dish => dish.ArchivedAt is null))
        {
            return Task.FromResult<ManagementFailure?>(new ManagementFailure(
                409, "category_contains_dishes", "Category contains dishes."));
        }
        menu.Categories.Remove(category);
        dbContext.MenuCategories.Remove(category);
        audit.EntityType = "menu_category";
        audit.EntityId = category.Id;
        return Task.FromResult<ManagementFailure?>(null);
    }, cancellationToken);

    public Task<ManagementResult<AdminMenuMutationResponse>> ReorderCategoriesAsync(
        OwnerRestaurantAccess access,
        string? etag,
        ReorderMenuCategoriesRequest request,
        CancellationToken cancellationToken) => MutateMenuAsync(access, etag, "menu.categories.reordered", async (menu, now, _) =>
    {
        var byId = menu.Categories.ToDictionary(item => item.Id);
        if (request.CategoryIds.Count != byId.Count || request.CategoryIds.Any(id => !byId.ContainsKey(id)))
        {
            return new ManagementFailure(400, "admin_validation", "Validation failed", Errors:
                new Dictionary<string, string[]>(StringComparer.Ordinal) { ["categoryIds"] = ["category_reorder_incomplete"] });
        }

        // The (menu_id, display_order) unique index is enforced per row, so the requested order is
        // staged above the current maximum before the final contiguous order is written.
        var ordered = request.CategoryIds.Select(id => byId[id]).ToArray();
        var stagingOffset = menu.Categories.Max(item => item.DisplayOrder) + 1;
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
            ordered[index].UpdatedAt = now;
            ordered[index].ConcurrencyVersion++;
        }
        return null;
    }, cancellationToken);

    /// <summary>
    /// Flushes a staged ordering pass inside the surrounding mutation transaction.
    /// </summary>
    private async Task<ManagementFailure?> StageAsync(CancellationToken cancellationToken)
    {
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return null;
        }
        catch (DbUpdateConcurrencyException)
        {
            return new ManagementFailure(409, "concurrency_conflict", "The draft changed; reload before saving");
        }
        catch (DbUpdateException)
        {
            return new ManagementFailure(409, "data_conflict", "The requested order conflicts with existing menu data");
        }
    }

    private async Task<ManagementResult<AdminMenuMutationResponse>> MutateMenuAsync(
        OwnerRestaurantAccess access,
        string? etag,
        string action,
        Func<MenuEntity, DateTimeOffset, MutationAudit, Task<ManagementFailure?>> apply,
        CancellationToken cancellationToken)
    {
        var audit = new MutationAudit();
        var outcome = await MutateCoreAsync(access, etag, action, async (restaurant, _) =>
        {
            var menu = restaurant.Menus.SingleOrDefault(item => item.IsActive);
            return menu is null
                ? new ManagementFailure(404, "menu_not_found", "The restaurant has no active menu")
                : await apply(menu, timeProvider.GetUtcNow(), audit);
        }, cancellationToken, audit);

        return outcome.Value is null
            ? ManagementResult<AdminMenuMutationResponse>.Failed(outcome.Failure!)
            : ManagementResult<AdminMenuMutationResponse>.Success(new AdminMenuMutationResponse(
                await ToAdminMenuAsync(outcome.Value.Restaurant, cancellationToken), outcome.Value.Publication));
    }

    private async Task<AdminMenuResponse> ToAdminMenuAsync(RestaurantEntity restaurant, CancellationToken cancellationToken)
    {
        var latest = await dbContext.PublicationOutbox.AsNoTracking()
            .Where(item => item.RestaurantId == restaurant.Id)
            .OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.OperationId)
            .FirstOrDefaultAsync(cancellationToken);
        var menu = restaurant.Menus.SingleOrDefault(item => item.IsActive);
        return new AdminMenuResponse(
            menu?.Id.ToString(),
            menu?.Name,
            menu is null
                ? []
                : menu.Categories.OrderBy(item => item.DisplayOrder).ThenBy(item => item.Id)
                    .Select(ToAdminCategory).ToArray(),
            restaurant.Settings.Locale,
            restaurant.Settings.Currency,
            restaurant.Settings.TaxDisplayMode,
            restaurant.Settings.TaxNoticeKey,
            BadgeCatalog.Codes.OrderBy(code => code, StringComparer.Ordinal).ToArray(),
            restaurant.DraftVersion.ToString(CultureInfo.InvariantCulture),
            DraftETag.Create(restaurant.Id, restaurant.DraftVersion),
            latest is null ? null : ToPublicationStatus(latest));
    }

    private static AdminMenuCategoryResponse ToAdminCategory(MenuCategoryEntity category)
    {
        var dishes = category.Dishes
            .Where(dish => dish.ArchivedAt is null)
            .OrderBy(dish => dish.DisplayOrder).ThenBy(dish => dish.Id)
            .Select(ToAdminDish).ToArray();
        return new AdminMenuCategoryResponse(
            category.Id.ToString(),
            category.Name,
            category.Description,
            category.Slug,
            category.DisplayOrder,
            category.IsActive,
            dishes.Length,
            dishes,
            category.CreatedAt,
            category.UpdatedAt);
    }

    private static AdminDishResponse ToAdminDish(DishEntity dish) => new(
        dish.Id.ToString(),
        dish.CategoryId.ToString(),
        dish.Name,
        dish.Description,
        dish.Price.ToString("0.00", CultureInfo.InvariantCulture),
        dish.Availability,
        dish.IsActive,
        dish.DisplayOrder,
        dish.MediaAssetId?.ToString(),
        dish.MediaAsset is null ? null : new AdminMainImageResponse(
            dish.MediaAsset.Id.ToString(),
            dish.MediaAsset.AltText,
            dish.MediaAsset.ProcessingStatus,
            dish.MediaAsset.Variants.OrderBy(item => item.Width).ThenBy(item => item.Height)
                .Select(item => new PublicMediaVariant(item.Url, item.Width, item.Height)).ToArray()),
        dish.Badges.Select(item => item.BadgeCode).OrderBy(code => code, StringComparer.Ordinal).ToArray(),
        dish.CreatedAt,
        dish.UpdatedAt);

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static ManagementFailure CategoryNotFound() =>
        new(404, "menu_category_not_found", "Category not found");

    private static ManagementFailure DishNotFound() =>
        new(404, "dish_not_found", "Dish not found");
}
