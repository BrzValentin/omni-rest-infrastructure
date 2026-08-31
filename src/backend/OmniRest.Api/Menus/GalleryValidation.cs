namespace OmniRest.Api.Menus;

/// <summary>
/// Field-level rules and error codes for the owner gallery surface
/// (<c>specifications/phase-5/pr-16-gallery-management.md</c> section 4).
/// </summary>
public static class GalleryValidation
{
    /// <summary>Implemented cap from <c>specifications/phase-5/README.md</c> ruling 10.</summary>
    public const int MaximumImages = 50;
    public const int AltTextMaxLength = 300;
    public const int CaptionMaxLength = 300;

    public const string FieldRequired = "field_required";
    public const string ValueTooLong = "value_too_long";
    public const string MediaFormRequired = "media_form_required";
    public const string ReorderIncomplete = "gallery_reorder_incomplete";
    public const string LimitReached = "gallery_limit_reached";
    public const string ImageNotFound = "gallery_image_not_found";

    public static IReadOnlyDictionary<string, string[]> ValidateUpload(
        string? altText,
        string? caption,
        bool hasFile)
    {
        var errors = NewErrors();
        if (!hasFile)
        {
            Add(errors, "file", FieldRequired);
        }
        ValidateAltText(errors, altText);
        ValidateCaption(errors, caption);
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateUpdate(UpdateGalleryImageRequest? request)
    {
        var errors = NewErrors();
        if (request is null)
        {
            Add(errors, "request", FieldRequired);
            return ToArrays(errors);
        }
        ValidateAltText(errors, request.AltText);
        ValidateCaption(errors, request.Caption);
        return ToArrays(errors);
    }

    public static IReadOnlyDictionary<string, string[]> ValidateReorder(ReorderGalleryImagesRequest? request)
    {
        var errors = NewErrors();
        if (request?.ImageIds is null || request.ImageIds.Count == 0)
        {
            Add(errors, "imageIds", FieldRequired);
            return ToArrays(errors);
        }
        if (request.ImageIds.Count > MaximumImages ||
            request.ImageIds.Any(id => id == Guid.Empty) ||
            request.ImageIds.Distinct().Count() != request.ImageIds.Count)
        {
            Add(errors, "imageIds", ReorderIncomplete);
        }
        return ToArrays(errors);
    }

    /// <summary>
    /// Reorder validation is total: the submitted list must be a permutation of exactly the
    /// restaurant's current image ids.
    /// </summary>
    public static bool IsCompletePermutation(IReadOnlyList<Guid> requested, IReadOnlyCollection<Guid> current)
    {
        if (requested.Count != current.Count)
        {
            return false;
        }
        var remaining = new HashSet<Guid>(current);
        foreach (var id in requested)
        {
            if (!remaining.Remove(id))
            {
                return false;
            }
        }
        return remaining.Count == 0;
    }

    public static IReadOnlyDictionary<string, string[]> ReorderIncompleteErrors() =>
        new Dictionary<string, string[]>(StringComparer.Ordinal) { ["imageIds"] = [ReorderIncomplete] };

    public static string? NormalizeCaption(string? caption) =>
        string.IsNullOrWhiteSpace(caption) ? null : caption.Trim();

    private static void ValidateAltText(Dictionary<string, List<string>> errors, string? altText)
    {
        if (string.IsNullOrWhiteSpace(altText))
        {
            Add(errors, "altText", FieldRequired);
            return;
        }
        var trimmed = altText.Trim();
        if (trimmed.Length > AltTextMaxLength)
        {
            Add(errors, "altText", ValueTooLong);
        }
        else if (trimmed.Any(char.IsControl))
        {
            Add(errors, "altText", FieldRequired);
        }
    }

    private static void ValidateCaption(Dictionary<string, List<string>> errors, string? caption)
    {
        if (caption is null)
        {
            return;
        }
        var trimmed = caption.Trim();
        if (trimmed.Length > CaptionMaxLength)
        {
            Add(errors, "caption", ValueTooLong);
        }
        else if (trimmed.Any(char.IsControl))
        {
            Add(errors, "caption", FieldRequired);
        }
    }

    private static Dictionary<string, List<string>> NewErrors() => new(StringComparer.Ordinal);

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

/// <summary>
/// The 1..N contiguous ordering rules from <c>pr-16-gallery-management.md</c> section 5. Ordering covers
/// every row regardless of <c>is_active</c>, so hiding a photo never renumbers the gallery.
/// </summary>
public static class GalleryOrdering
{
    public const int FirstDisplayOrder = 1;

    /// <summary>A new image receives <c>max(display_order) + 1</c>, or 1 when the gallery is empty.</summary>
    public static int NextDisplayOrder(IEnumerable<int> currentOrders)
    {
        var maximum = 0;
        foreach (var order in currentOrders)
        {
            if (order > maximum)
            {
                maximum = order;
            }
        }
        return maximum + FirstDisplayOrder;
    }

    /// <summary>
    /// The offset the staged pass writes above, so the unique <c>(restaurant_id, display_order)</c> index
    /// never sees two rows claim the same slot mid-flight.
    /// </summary>
    public static int StagingOffset(IEnumerable<int> currentOrders) => NextDisplayOrder(currentOrders);

    /// <summary>Assigns 1..N in the supplied relative order.</summary>
    public static IReadOnlyList<KeyValuePair<Guid, int>> Assign(IEnumerable<Guid> orderedIds) =>
        orderedIds.Select((id, index) => new KeyValuePair<Guid, int>(id, index + FirstDisplayOrder)).ToArray();

    /// <summary>
    /// Assigns the temporary orders the staged pass writes before the final 1..N flush. Every staged slot sits
    /// at or above <paramref name="stagingOffset"/>, which <see cref="StagingOffset"/> puts above every current
    /// order, so no staged row ever collides with a row still holding its old slot or with the final 1..N.
    /// </summary>
    public static IReadOnlyList<KeyValuePair<Guid, int>> Stage(IEnumerable<Guid> orderedIds, int stagingOffset) =>
        orderedIds.Select((id, index) => new KeyValuePair<Guid, int>(id, stagingOffset + index)).ToArray();

    /// <summary>
    /// Renumbers survivors to a contiguous 1..N while preserving their existing relative order, which is
    /// what a delete leaves behind.
    /// </summary>
    public static IReadOnlyList<KeyValuePair<Guid, int>> Renumber(
        IEnumerable<(Guid Id, int DisplayOrder)> survivors) =>
        Assign(survivors
            .OrderBy(item => item.DisplayOrder)
            .ThenBy(item => item.Id)
            .Select(item => item.Id));
}
