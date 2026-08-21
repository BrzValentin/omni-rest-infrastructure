namespace OmniRest.Api.Restaurants;

public static class WebsiteDesignIds
{
    public const string LegacyCurrent = "legacy-current-v1";
    public const string QuietElegance = "quiet-elegance-v1";
    public const string Nightfall = "nightfall-v1";
    public const string Broadsheet = "broadsheet-v1";
    public const string Sunroom = "sunroom-v1";
}

public static class WebsiteDesignAvailability
{
    public const string Available = "available";
    public const string Grandfathered = "grandfathered";
}

public sealed record WebsiteDesignDefinition(
    string Id,
    string Name,
    string ContractVersion,
    string Availability)
{
    public bool IsSelectable => Availability == WebsiteDesignAvailability.Available;
}

public static class WebsiteDesignCatalog
{
    public const string CurrentContractVersion = "1";

    private static readonly WebsiteDesignDefinition[] OrderedDefinitions =
    [
        new(
            WebsiteDesignIds.LegacyCurrent,
            "Current design",
            CurrentContractVersion,
            WebsiteDesignAvailability.Grandfathered),
        new(
            WebsiteDesignIds.QuietElegance,
            "Quiet Elegance",
            CurrentContractVersion,
            WebsiteDesignAvailability.Available),
        new(
            WebsiteDesignIds.Nightfall,
            "Nightfall",
            CurrentContractVersion,
            WebsiteDesignAvailability.Available),
        new(
            WebsiteDesignIds.Broadsheet,
            "Broadsheet",
            CurrentContractVersion,
            WebsiteDesignAvailability.Available),
        new(
            WebsiteDesignIds.Sunroom,
            "Sunroom",
            CurrentContractVersion,
            WebsiteDesignAvailability.Available)
    ];

    private static readonly IReadOnlyDictionary<string, WebsiteDesignDefinition> Definitions =
        OrderedDefinitions.ToDictionary(definition => definition.Id, StringComparer.Ordinal);

    public static IReadOnlyList<WebsiteDesignDefinition> All => OrderedDefinitions;

    public static IReadOnlyList<WebsiteDesignDefinition> Selectable =>
        OrderedDefinitions.Where(design => design.IsSelectable).ToArray();

    public static bool IsSupported(string? designId) =>
        designId is not null && Definitions.ContainsKey(designId);

    public static bool IsSelectable(string? designId) =>
        designId is not null &&
        Definitions.TryGetValue(designId, out var definition) &&
        definition.IsSelectable;

    public static string ResolvePublished(string? designId) =>
        IsSupported(designId) ? designId! : WebsiteDesignIds.LegacyCurrent;
}
