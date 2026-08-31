using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniRest.Api.Data.Migrations;

/// <summary>
/// Phase 6 (SEO/Schema.org) needs restaurant identity the domain lacked: the Schema.org
/// <c>FoodEstablishment</c> subtype and price band that drive JSON-LD, plus dedicated logo and cover
/// image slots. It also widens the social platform allow-list with x, youtube, and linkedin (PR-18 Task 7).
/// </summary>
[DbContext(typeof(MenuDbContext))]
[Migration("20260901120000_Phase6RestaurantIdentity")]
public sealed class Phase6RestaurantIdentity : Migration
{
    private const string LegacySocialPlatforms =
        "platform IN ('instagram', 'facebook', 'tiktok', 'google_business')";

    private const string SocialPlatforms =
        "platform IN ('instagram', 'facebook', 'tiktok', 'google_business', 'x', 'youtube', 'linkedin')";

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "restaurant_type",
            schema: "public",
            table: "restaurants",
            type: "character varying(40)",
            maxLength: 40,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "price_range",
            schema: "public",
            table: "restaurants",
            type: "character varying(4)",
            maxLength: 4,
            nullable: true);

        migrationBuilder.AddColumn<Guid>(
            name: "logo_media_asset_id",
            schema: "public",
            table: "restaurants",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddColumn<Guid>(
            name: "cover_media_asset_id",
            schema: "public",
            table: "restaurants",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddCheckConstraint(
            name: "ck_restaurants_restaurant_type",
            schema: "public",
            table: "restaurants",
            sql: "restaurant_type IS NULL OR restaurant_type IN ('Restaurant','CafeOrCoffeeShop','Bakery','BarOrPub','Brewery','Distillery','FastFoodRestaurant','IceCreamShop','Winery')");

        migrationBuilder.AddCheckConstraint(
            name: "ck_restaurants_price_range",
            schema: "public",
            table: "restaurants",
            sql: "price_range IS NULL OR price_range IN ('$','$$','$$$','$$$$')");

        migrationBuilder.CreateIndex(
            name: "IX_restaurants_logo_media_asset_id_id",
            schema: "public",
            table: "restaurants",
            columns: ["logo_media_asset_id", "id"]);

        migrationBuilder.CreateIndex(
            name: "IX_restaurants_cover_media_asset_id_id",
            schema: "public",
            table: "restaurants",
            columns: ["cover_media_asset_id", "id"]);

        // Composite tenant-safe foreign keys: the restaurant identity travels with the asset identity, so
        // a restaurant is physically unable to point at another tenant's media asset.
        migrationBuilder.AddForeignKey(
            name: "FK_restaurants_media_assets_logo_media_asset_id_id",
            schema: "public",
            table: "restaurants",
            columns: ["logo_media_asset_id", "id"],
            principalSchema: "public",
            principalTable: "media_assets",
            principalColumns: ["id", "restaurant_id"],
            onDelete: ReferentialAction.Restrict);

        migrationBuilder.AddForeignKey(
            name: "FK_restaurants_media_assets_cover_media_asset_id_id",
            schema: "public",
            table: "restaurants",
            columns: ["cover_media_asset_id", "id"],
            principalSchema: "public",
            principalTable: "media_assets",
            principalColumns: ["id", "restaurant_id"],
            onDelete: ReferentialAction.Restrict);

        migrationBuilder.DropCheckConstraint(
            name: "ck_social_links_platform",
            schema: "public",
            table: "social_links");

        migrationBuilder.AddCheckConstraint(
            name: "ck_social_links_platform",
            schema: "public",
            table: "social_links",
            sql: SocialPlatforms);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "ck_social_links_platform",
            schema: "public",
            table: "social_links");

        // Rows on the widened platforms cannot satisfy the narrower constraint, so they go first.
        migrationBuilder.Sql(
            "DELETE FROM public.social_links WHERE platform IN ('x', 'youtube', 'linkedin')");

        migrationBuilder.AddCheckConstraint(
            name: "ck_social_links_platform",
            schema: "public",
            table: "social_links",
            sql: LegacySocialPlatforms);

        migrationBuilder.DropForeignKey(
            name: "FK_restaurants_media_assets_cover_media_asset_id_id",
            schema: "public",
            table: "restaurants");

        migrationBuilder.DropForeignKey(
            name: "FK_restaurants_media_assets_logo_media_asset_id_id",
            schema: "public",
            table: "restaurants");

        migrationBuilder.DropIndex(
            name: "IX_restaurants_cover_media_asset_id_id",
            schema: "public",
            table: "restaurants");

        migrationBuilder.DropIndex(
            name: "IX_restaurants_logo_media_asset_id_id",
            schema: "public",
            table: "restaurants");

        migrationBuilder.DropCheckConstraint(
            name: "ck_restaurants_price_range",
            schema: "public",
            table: "restaurants");

        migrationBuilder.DropCheckConstraint(
            name: "ck_restaurants_restaurant_type",
            schema: "public",
            table: "restaurants");

        migrationBuilder.DropColumn(
            name: "cover_media_asset_id",
            schema: "public",
            table: "restaurants");

        migrationBuilder.DropColumn(
            name: "logo_media_asset_id",
            schema: "public",
            table: "restaurants");

        migrationBuilder.DropColumn(
            name: "price_range",
            schema: "public",
            table: "restaurants");

        migrationBuilder.DropColumn(
            name: "restaurant_type",
            schema: "public",
            table: "restaurants");
    }
}
