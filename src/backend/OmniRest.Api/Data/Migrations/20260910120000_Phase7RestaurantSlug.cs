using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniRest.Api.Data.Migrations;

/// <summary>
/// Phase 7 resolves a restaurant from a slug label beneath a configured platform base domain, so
/// <c>prairie-table.example.app</c> reaches a tenant that has no dedicated <c>restaurant_domains</c>
/// row (PR-20 Task 2). The column is nullable because a restaurant reached only through a custom
/// domain needs no slug, and uniquely indexed where present because a slug that exists must identify
/// exactly one tenant.
/// </summary>
[DbContext(typeof(MenuDbContext))]
[Migration("20260910120000_Phase7RestaurantSlug")]
public sealed class Phase7RestaurantSlug : Migration
{
    // Must match RestaurantSlugs.CheckExpression exactly, or the model and the database drift apart.
    private const string SlugCheck =
        "slug IS NULL OR (length(slug) BETWEEN 1 AND 63 AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')";

    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "slug",
            schema: "public",
            table: "restaurants",
            type: "character varying(63)",
            maxLength: 63,
            nullable: true);

        migrationBuilder.AddCheckConstraint(
            name: "ck_restaurants_slug",
            schema: "public",
            table: "restaurants",
            sql: SlugCheck);

        // Filtered so many restaurants may share the absence of a slug while each present slug is unique.
        migrationBuilder.CreateIndex(
            name: "IX_restaurants_slug",
            schema: "public",
            table: "restaurants",
            column: "slug",
            unique: true,
            filter: "slug IS NOT NULL");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_restaurants_slug",
            schema: "public",
            table: "restaurants");

        migrationBuilder.DropCheckConstraint(
            name: "ck_restaurants_slug",
            schema: "public",
            table: "restaurants");

        migrationBuilder.DropColumn(
            name: "slug",
            schema: "public",
            table: "restaurants");
    }
}
