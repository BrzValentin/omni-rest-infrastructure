using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniRest.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase5RestaurantGallery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "file_size_bytes",
                schema: "public",
                table: "media_variants",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "storage_key",
                schema: "public",
                table: "media_variants",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "restaurant_gallery_images",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    media_asset_id = table.Column<Guid>(type: "uuid", nullable: false),
                    caption = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_restaurant_gallery_images", x => x.id);
                    table.CheckConstraint("ck_restaurant_gallery_images_caption", "caption IS NULL OR length(btrim(caption)) > 0");
                    table.CheckConstraint("ck_restaurant_gallery_images_display_order", "display_order > 0");
                    table.ForeignKey(
                        name: "FK_restaurant_gallery_images_media_assets_media_asset_id_resta~",
                        columns: x => new { x.media_asset_id, x.restaurant_id },
                        principalSchema: "public",
                        principalTable: "media_assets",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_restaurant_gallery_images_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_gallery_images_media_asset_id_restaurant_id",
                schema: "public",
                table: "restaurant_gallery_images",
                columns: new[] { "media_asset_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_gallery_images_restaurant_id_display_order",
                schema: "public",
                table: "restaurant_gallery_images",
                columns: new[] { "restaurant_id", "display_order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_gallery_images_restaurant_id_is_active_display_o~",
                schema: "public",
                table: "restaurant_gallery_images",
                columns: new[] { "restaurant_id", "is_active", "display_order" });

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_gallery_images_restaurant_id_media_asset_id",
                schema: "public",
                table: "restaurant_gallery_images",
                columns: new[] { "restaurant_id", "media_asset_id" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "restaurant_gallery_images",
                schema: "public");

            migrationBuilder.DropColumn(
                name: "file_size_bytes",
                schema: "public",
                table: "media_variants");

            migrationBuilder.DropColumn(
                name: "storage_key",
                schema: "public",
                table: "media_variants");
        }
    }
}
