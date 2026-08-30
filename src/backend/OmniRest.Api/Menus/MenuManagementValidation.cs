namespace OmniRest.Api.Menus;

public static partial class MenuManagementValidation
{
    public const int CategoryNameMaxLength = 100;
    public const int CategoryDescriptionMaxLength = 300;
    public const int CategoryReorderMaxCount = 200;

    public static IReadOnlyDictionary<string, string[]> ValidateCreateCategory(CreateMenuCategoryRequest? request)
    {
        var errors = NewErrors();
        if (request is null)
        {
            Add(errors, "request", "request_required");
            return ToArrays(errors);
        }
        ValidateCategoryFields(errors, request.Name, request.Description);
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateUpdateCategory(UpdateMenuCategoryRequest? request)
    {
        var errors = NewErrors();
        if (request is null)
        {
            Add(errors, "request", "request_required");
            return ToArrays(errors);
        }
        ValidateCategoryFields(errors, request.Name, request.Description);
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateReorderCategories(ReorderMenuCategoriesRequest? request)
    {
        var errors = NewErrors();
        if (request?.CategoryIds is null)
        {
            Add(errors, "categoryIds", "field_required");
            return ToArrays(errors);
        }
        if (request.CategoryIds.Count == 0)
        {
            Add(errors, "categoryIds", "field_required");
        }
        else if (request.CategoryIds.Count > CategoryReorderMaxCount)
        {
            Add(errors, "categoryIds", "category_reorder_limit");
        }
        else if (request.CategoryIds.Any(id => id == Guid.Empty))
        {
            Add(errors, "categoryIds", "category_id_invalid");
        }
        else if (request.CategoryIds.Distinct().Count() != request.CategoryIds.Count)
        {
            Add(errors, "categoryIds", "category_reorder_duplicate");
        }
        return ToArrays(errors);
    }

    private static void ValidateCategoryFields(Dictionary<string, List<string>> errors, string? name, string? description)
    {
        ValidateText(errors, "name", name, 1, CategoryNameMaxLength, required: true);
        ValidateText(errors, "description", description, 1, CategoryDescriptionMaxLength, required: false);
    }

    private static Dictionary<string, List<string>> NewErrors() => new(StringComparer.Ordinal);

    private static void ValidateText(
        Dictionary<string, List<string>> errors,
        string field,
        string? value,
        int minimum,
        int maximum,
        bool required)
    {
        if (value is null)
        {
            if (required) Add(errors, field, "field_required");
            return;
        }
        var trimmed = value.Trim();
        if (trimmed.Length < minimum || trimmed.Length > maximum || trimmed.Any(char.IsControl))
        {
            Add(errors, field, "field_length_invalid");
        }
    }

    private static void Add(Dictionary<string, List<string>> errors, string field, string code)
    {
        if (!errors.TryGetValue(field, out var values))
        {
            values = [];
            errors[field] = values;
        }
        values.Add(code);
    }

    private static IReadOnlyDictionary<string, string[]> ToArrays(Dictionary<string, List<string>> errors) =>
        errors.ToDictionary(item => item.Key, item => item.Value.ToArray(), StringComparer.Ordinal);
}
