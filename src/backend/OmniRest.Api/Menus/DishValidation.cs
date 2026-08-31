namespace OmniRest.Api.Menus;

public static partial class MenuManagementValidation
{
    public const int DishNameMaxLength = 160;
    public const int DishDescriptionMaxLength = 1000;
    public const int DishBadgeMaxCount = 9;
    public const int DishReorderMaxCount = 500;

    /// <summary>
    /// Largest price the <c>numeric(12, 2)</c> price column can hold.
    /// </summary>
    public const decimal PriceMaximum = 9_999_999_999.99m;

    public static IReadOnlyDictionary<string, string[]> ValidateCreateDish(CreateDishRequest? request)
    {
        var errors = NewErrors();
        if (request is null)
        {
            Add(errors, "request", "request_required");
            return ToArrays(errors);
        }
        ValidateDishFields(errors, request.CategoryId, request.Name, request.Price, request.Description,
            request.Availability, request.Badges);
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateUpdateDish(UpdateDishRequest? request)
    {
        var errors = NewErrors();
        if (request is null)
        {
            Add(errors, "request", "request_required");
            return ToArrays(errors);
        }
        ValidateDishFields(errors, request.CategoryId, request.Name, request.Price, request.Description,
            request.Availability, request.Badges);
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateDishPrice(UpdateDishPriceRequest? request)
    {
        var errors = NewErrors();
        if (request is null)
        {
            Add(errors, "request", "request_required");
            return ToArrays(errors);
        }
        ValidatePrice(errors, request.Price);
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateDishAvailability(UpdateDishAvailabilityRequest? request)
    {
        var errors = NewErrors();
        if (request?.Status is null)
        {
            Add(errors, "status", "field_required");
            return ToArrays(errors);
        }
        if (!AvailabilityStatus.IsValid(request.Status))
        {
            Add(errors, "status", "availability_invalid");
        }
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateReorderDishes(ReorderDishesRequest? request)
    {
        var errors = NewErrors();
        if (request is null)
        {
            Add(errors, "request", "request_required");
            return ToArrays(errors);
        }
        if (request.CategoryId == Guid.Empty)
        {
            Add(errors, "categoryId", "field_required");
        }
        if (request.DishIds is null || request.DishIds.Count == 0)
        {
            Add(errors, "dishIds", "field_required");
        }
        else if (request.DishIds.Count > DishReorderMaxCount)
        {
            Add(errors, "dishIds", "dish_reorder_limit");
        }
        else if (request.DishIds.Any(id => id == Guid.Empty))
        {
            Add(errors, "dishIds", "dish_id_invalid");
        }
        else if (request.DishIds.Distinct().Count() != request.DishIds.Count)
        {
            Add(errors, "dishIds", "dish_reorder_duplicate");
        }
        return ToArrays(errors);
    }

    private static void ValidateDishFields(
        Dictionary<string, List<string>> errors,
        Guid categoryId,
        string? name,
        decimal price,
        string? description,
        string? availability,
        IReadOnlyList<string>? badges)
    {
        if (categoryId == Guid.Empty)
        {
            Add(errors, "categoryId", "field_required");
        }
        ValidateText(errors, "name", name, 1, DishNameMaxLength, required: true);
        ValidateText(errors, "description", description, 1, DishDescriptionMaxLength, required: false);
        ValidatePrice(errors, price);
        if (availability is not null && !AvailabilityStatus.IsValid(availability))
        {
            Add(errors, "availability", "availability_invalid");
        }
        ValidateBadges(errors, badges);
    }

    /// <summary>
    /// Shared price rule: a nonnegative amount with at most two decimal places, within the storage precision.
    /// </summary>
    private static void ValidatePrice(Dictionary<string, List<string>> errors, decimal price)
    {
        if (price < 0)
        {
            Add(errors, "price", "price_negative");
            return;
        }
        if (price > PriceMaximum)
        {
            Add(errors, "price", "price_too_large");
            return;
        }
        if (decimal.Round(price, 2) != price)
        {
            Add(errors, "price", "price_scale_invalid");
        }
    }

    private static void ValidateBadges(Dictionary<string, List<string>> errors, IReadOnlyList<string>? badges)
    {
        if (badges is null)
        {
            return;
        }
        if (badges.Count > DishBadgeMaxCount)
        {
            Add(errors, "badges", "badge_limit");
            return;
        }
        if (badges.Any(code => code is null) ||
            badges.Distinct(StringComparer.Ordinal).Count() != badges.Count)
        {
            Add(errors, "badges", "badge_duplicate");
            return;
        }
        if (badges.Any(code => !BadgeCatalog.TryGet(code, out _)))
        {
            Add(errors, "badges", "badge_unknown");
        }
    }
}
