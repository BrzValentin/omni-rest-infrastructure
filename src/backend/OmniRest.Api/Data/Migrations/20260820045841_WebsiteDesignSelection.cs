using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniRest.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WebsiteDesignSelection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "website_design_id",
                schema: "public",
                table: "restaurant_settings",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "legacy-current-v1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "website_design_id",
                schema: "public",
                table: "restaurant_settings");
        }
    }
}
