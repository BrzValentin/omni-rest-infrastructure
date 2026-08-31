using Microsoft.EntityFrameworkCore;

namespace OmniRest.Api.Data;

/// <summary>
/// The Schema.org <c>FoodEstablishment</c> subtypes a restaurant may declare. The stored value is used
/// verbatim as the JSON-LD <c>@type</c>, so it is PascalCase exactly as Schema.org spells it.
/// </summary>
public static class RestaurantTypes
{
    public const string Restaurant = "Restaurant";
    public const string CafeOrCoffeeShop = "CafeOrCoffeeShop";
    public const string Bakery = "Bakery";
    public const string BarOrPub = "BarOrPub";
    public const string Brewery = "Brewery";
    public const string Distillery = "Distillery";
    public const string FastFoodRestaurant = "FastFoodRestaurant";
    public const string IceCreamShop = "IceCreamShop";
    public const string Winery = "Winery";

    public static IReadOnlyList<string> All { get; } =
    [
        Restaurant, CafeOrCoffeeShop, Bakery, BarOrPub, Brewery,
        Distillery, FastFoodRestaurant, IceCreamShop, Winery
    ];

    public static bool IsValid(string value) => All.Contains(value, StringComparer.Ordinal);
}

/// <summary>The Schema.org <c>priceRange</c> bands a restaurant may declare.</summary>
public static class PriceRanges
{
    public const string Budget = "$";
    public const string Moderate = "$$";
    public const string Upscale = "$$$";
    public const string FineDining = "$$$$";

    public static IReadOnlyList<string> All { get; } = [Budget, Moderate, Upscale, FineDining];

    public static bool IsValid(string value) => All.Contains(value, StringComparer.Ordinal);
}

public sealed partial class MenuDbContext
{
    private static void ConfigurePhase6(ModelBuilder modelBuilder)
    {
        ConfigureRestaurantIdentity(modelBuilder);
    }

    private static void ConfigureRestaurantIdentity(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<RestaurantEntity>();

        // There is no naming-convention package in this solution, so every column name is explicit:
        // an unmapped property silently becomes a PascalCase column the migrations never create.
        entity.Property(x => x.RestaurantType).HasColumnName("restaurant_type").HasMaxLength(40);
        entity.Property(x => x.PriceRange).HasColumnName("price_range").HasMaxLength(4);
        entity.Property(x => x.LogoMediaAssetId).HasColumnName("logo_media_asset_id");
        entity.Property(x => x.CoverMediaAssetId).HasColumnName("cover_media_asset_id");

        // Composite tenant-safe foreign keys, matching MainMediaAsset: the restaurant identity travels
        // with the asset identity, so a restaurant is physically unable to reference another tenant's asset.
        entity.HasOne(x => x.LogoMediaAsset).WithMany()
            .HasForeignKey(x => new { x.LogoMediaAssetId, x.Id })
            .HasPrincipalKey(x => new { x.Id, x.RestaurantId })
            .OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(x => x.CoverMediaAsset).WithMany()
            .HasForeignKey(x => new { x.CoverMediaAssetId, x.Id })
            .HasPrincipalKey(x => new { x.Id, x.RestaurantId })
            .OnDelete(DeleteBehavior.Restrict);

        entity.ToTable(table =>
        {
            table.HasCheckConstraint(
                "ck_restaurants_restaurant_type",
                $"restaurant_type IS NULL OR restaurant_type IN ({FormatAllowedValues(RestaurantTypes.All)})");
            table.HasCheckConstraint(
                "ck_restaurants_price_range",
                $"price_range IS NULL OR price_range IN ({FormatAllowedValues(PriceRanges.All)})");
        });
    }

    private static string FormatAllowedValues(IReadOnlyList<string> values) =>
        string.Join(",", values.Select(value => $"'{value}'"));
}
