using System.Text.Json.Serialization;

namespace OmniRest.Api.Menus;

using OmniRest.Api.Restaurants;

public sealed record PublicMenuResponse(
    string RestaurantId,
    string RestaurantName,
    string Locale,
    string Currency,
    string TaxDisplayMode,
    string? TaxNoticeKey,
    string PublicationVersion,
    PublicMenu? Menu,
    PublicRestaurantResponse? Restaurant = null,
    string? WebsiteDesignId = null);

public sealed record PublicMenu(string Id, string Name, IReadOnlyList<PublicCategory> Categories);

public sealed record PublicCategory(
    string Id,
    string Slug,
    string Name,
    string? Description,
    IReadOnlyList<PublicDish> Dishes);

public sealed record PublicDish(
    string Id,
    string Name,
    string? Description,
    string Price,
    string Availability,
    PublicMedia? Media,
    IReadOnlyList<PublicBadge> Badges);

public sealed record PublicMedia(string AltText, IReadOnlyList<PublicMediaVariant> Variants);

public sealed record PublicMediaVariant(string Url, int Width, int Height);

public sealed record PublicBadge(string Code, string LabelKey, string Category);

public static class AvailabilityStatus
{
    public const string Available = "available";
    public const string Unavailable = "unavailable";

    public static bool IsValid(string value) => value is Available or Unavailable;

    public static bool CanBeOrdered(string value) => value == Available;
}

public static class BadgeCatalog
{
    private static readonly IReadOnlyDictionary<string, (string LabelKey, string Category)> Definitions =
        new Dictionary<string, (string, string)>(StringComparer.Ordinal)
        {
            ["vegetarian"] = ("menu.badge.vegetarian", "dietary"),
            ["vegan"] = ("menu.badge.vegan", "dietary"),
            ["gluten_free"] = ("menu.badge.glutenFree", "dietary"),
            ["dairy_free"] = ("menu.badge.dairyFree", "dietary"),
            ["halal"] = ("menu.badge.halal", "dietary"),
            ["spicy"] = ("menu.badge.spicy", "heat"),
            ["contains_nuts"] = ("menu.badge.containsNuts", "allergen"),
            ["popular"] = ("menu.badge.popular", "promotional"),
            ["new"] = ("menu.badge.new", "promotional")
        };

    public static IReadOnlyCollection<string> Codes => Definitions.Keys.ToArray();

    public static bool TryGet(string code, out (string LabelKey, string Category) definition) =>
        Definitions.TryGetValue(code, out definition);
}

[JsonSerializable(typeof(PublicMenuResponse))]
internal partial class PublicMenuJsonContext : JsonSerializerContext;
