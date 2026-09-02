using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniRest.Api.Data.Migrations;

/// <summary>
/// Phase 8 adds the restaurant's own website address (PR-24). The column is nullable because a tenant
/// whose only web presence is this platform has no other site to link, and it is capped at the same 2048
/// characters as every other stored URL so a value that validates can always be persisted verbatim.
/// Scheme and host rules live in <c>RestaurantValidation</c> rather than in a check constraint: they
/// reject things SQL cannot see (userinfo, non-default ports) and must stay a single source of truth.
/// </summary>
[DbContext(typeof(MenuDbContext))]
[Migration("20260920120000_Phase8RestaurantWebsiteUrl")]
public sealed class Phase8RestaurantWebsiteUrl : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        migrationBuilder.AddColumn<string>(
            name: "website_url",
            schema: "public",
            table: "restaurants",
            type: "character varying(2048)",
            maxLength: 2048,
            nullable: true);

    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropColumn(
            name: "website_url",
            schema: "public",
            table: "restaurants");
}
