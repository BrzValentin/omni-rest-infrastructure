using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Menus;

public sealed record CreateMenuCategoryRequest(string Name, string? Description);

public sealed record UpdateMenuCategoryRequest(string Name, string? Description);

public sealed record ReorderMenuCategoriesRequest(IReadOnlyList<Guid> CategoryIds);

public sealed record CreateDishRequest(
    Guid CategoryId,
    string Name,
    decimal Price,
    string? Description,
    Guid? MediaAssetId,
    string? Availability,
    IReadOnlyList<string>? Badges);

public sealed record UpdateDishRequest(
    Guid CategoryId,
    string Name,
    decimal Price,
    string? Description,
    Guid? MediaAssetId,
    string? Availability,
    IReadOnlyList<string>? Badges);

public sealed record UpdateDishPriceRequest(decimal Price);

public sealed record UpdateDishAvailabilityRequest(string Status);

public sealed record ReorderDishesRequest(Guid CategoryId, IReadOnlyList<Guid> DishIds);

public sealed record AdminDishResponse(
    string Id,
    string CategoryId,
    string Name,
    string? Description,
    string Price,
    string Availability,
    bool IsActive,
    int DisplayOrder,
    string? MediaAssetId,
    AdminMainImageResponse? Media,
    IReadOnlyList<string> Badges,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record AdminMenuCategoryResponse(
    string Id,
    string Name,
    string? Description,
    string Slug,
    int DisplayOrder,
    bool IsActive,
    int DishCount,
    IReadOnlyList<AdminDishResponse> Dishes,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record AdminMenuResponse(
    string? MenuId,
    string? MenuName,
    IReadOnlyList<AdminMenuCategoryResponse> Categories,
    string Locale,
    string Currency,
    string TaxDisplayMode,
    string? TaxNoticeKey,
    IReadOnlyList<string> AvailableBadges,
    string DraftVersion,
    string ETag,
    PublicationStatusResponse? PublicationStatus);

public sealed record AdminMenuMutationResponse(AdminMenuResponse Menu, PublicationStatusResponse Publication);
