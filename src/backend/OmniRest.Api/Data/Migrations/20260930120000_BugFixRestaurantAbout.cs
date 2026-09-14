using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniRest.Api.Data.Migrations;

/// <summary>
/// BUG-001 adds the owner's longer "About Us" copy. It is a new column rather than a wider
/// <c>description</c> because the hero and JSON-LD rely on that field staying a short summary. The column
/// is nullable so every existing tenant upgrades with no About section instead of a placeholder, and it is
/// capped at the same 2000 characters <c>RestaurantValidation</c> enforces after trimming, so a value that
/// validates can always be persisted verbatim.
/// </summary>
[DbContext(typeof(MenuDbContext))]
[Migration("20260930120000_BugFixRestaurantAbout")]
public sealed class BugFixRestaurantAbout : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.AddColumn<string>(
            name: "about",
            schema: "public",
            table: "restaurants",
            type: "character varying(2000)",
            maxLength: 2000,
            nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(
            name: "about",
            schema: "public",
            table: "restaurants");
}
