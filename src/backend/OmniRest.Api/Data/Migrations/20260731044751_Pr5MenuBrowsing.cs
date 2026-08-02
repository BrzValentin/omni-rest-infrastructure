using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniRest.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Pr5MenuBrowsing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "public");

            migrationBuilder.CreateTable(
                name: "restaurants",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_restaurants", x => x.id);
                    table.CheckConstraint("ck_restaurants_name", "length(btrim(name)) > 0");
                });

            migrationBuilder.CreateTable(
                name: "badges",
                schema: "public",
                columns: table => new
                {
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    label_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    category = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_badges", x => new { x.restaurant_id, x.code });
                    table.CheckConstraint("ck_badges_category", "category IN ('dietary', 'allergen', 'promotional', 'heat')");
                    table.ForeignKey(
                        name: "FK_badges_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "media_assets",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    alt_text = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_media_assets", x => x.id);
                    table.UniqueConstraint("AK_media_assets_id_restaurant_id", x => new { x.id, x.restaurant_id });
                    table.ForeignKey(
                        name: "FK_media_assets_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "menus",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_menus", x => x.id);
                    table.UniqueConstraint("AK_menus_id_restaurant_id", x => new { x.id, x.restaurant_id });
                    table.CheckConstraint("ck_menus_name", "length(btrim(name)) > 0");
                    table.ForeignKey(
                        name: "FK_menus_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "publications",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    version = table.Column<long>(type: "bigint", nullable: false),
                    snapshot = table.Column<string>(type: "jsonb", nullable: false),
                    is_current = table.Column<bool>(type: "boolean", nullable: false),
                    published_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_publications", x => x.id);
                    table.CheckConstraint("ck_publications_version", "version > 0");
                    table.ForeignKey(
                        name: "FK_publications_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "restaurant_domains",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    host = table.Column<string>(type: "character varying(253)", maxLength: 253, nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_restaurant_domains", x => x.id);
                    table.CheckConstraint("ck_restaurant_domains_normalized", "host = lower(host) AND host !~ '[:/\\s]'");
                    table.ForeignKey(
                        name: "FK_restaurant_domains_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "restaurant_settings",
                schema: "public",
                columns: table => new
                {
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    locale = table.Column<string>(type: "character varying(35)", maxLength: 35, nullable: false),
                    currency = table.Column<string>(type: "character(3)", fixedLength: true, maxLength: 3, nullable: false),
                    tax_display_mode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    tax_notice_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_restaurant_settings", x => x.restaurant_id);
                    table.CheckConstraint("ck_restaurant_settings_tax_mode", "tax_display_mode IN ('inclusive', 'exclusive')");
                    table.ForeignKey(
                        name: "FK_restaurant_settings_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "media_variants",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    media_asset_id = table.Column<Guid>(type: "uuid", nullable: false),
                    url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    width = table.Column<int>(type: "integer", nullable: false),
                    height = table.Column<int>(type: "integer", nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_media_variants", x => x.id);
                    table.CheckConstraint("ck_media_variants_dimensions", "width > 0 AND height > 0");
                    table.ForeignKey(
                        name: "FK_media_variants_media_assets_media_asset_id_restaurant_id",
                        columns: x => new { x.media_asset_id, x.restaurant_id },
                        principalSchema: "public",
                        principalTable: "media_assets",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "menu_categories",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    menu_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_menu_categories", x => x.id);
                    table.UniqueConstraint("AK_menu_categories_id_menu_id_restaurant_id", x => new { x.id, x.menu_id, x.restaurant_id });
                    table.CheckConstraint("ck_menu_categories_display_order", "display_order >= 0");
                    table.CheckConstraint("ck_menu_categories_name", "length(btrim(name)) > 0");
                    table.ForeignKey(
                        name: "FK_menu_categories_menus_menu_id_restaurant_id",
                        columns: x => new { x.menu_id, x.restaurant_id },
                        principalSchema: "public",
                        principalTable: "menus",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "dishes",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    menu_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    price = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    media_asset_id = table.Column<Guid>(type: "uuid", nullable: true),
                    availability_status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    archived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_dishes", x => x.id);
                    table.UniqueConstraint("AK_dishes_id_restaurant_id", x => new { x.id, x.restaurant_id });
                    table.CheckConstraint("ck_dishes_display_order", "display_order >= 0");
                    table.CheckConstraint("ck_dishes_name", "length(btrim(name)) > 0");
                    table.CheckConstraint("ck_dishes_price", "price >= 0");
                    table.ForeignKey(
                        name: "FK_dishes_media_assets_media_asset_id_restaurant_id",
                        columns: x => new { x.media_asset_id, x.restaurant_id },
                        principalSchema: "public",
                        principalTable: "media_assets",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_dishes_menu_categories_category_id_menu_id_restaurant_id",
                        columns: x => new { x.category_id, x.menu_id, x.restaurant_id },
                        principalSchema: "public",
                        principalTable: "menu_categories",
                        principalColumns: new[] { "id", "menu_id", "restaurant_id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "dish_badges",
                schema: "public",
                columns: table => new
                {
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    dish_id = table.Column<Guid>(type: "uuid", nullable: false),
                    badge_code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_dish_badges", x => new { x.restaurant_id, x.dish_id, x.badge_code });
                    table.ForeignKey(
                        name: "FK_dish_badges_badges_restaurant_id_badge_code",
                        columns: x => new { x.restaurant_id, x.badge_code },
                        principalSchema: "public",
                        principalTable: "badges",
                        principalColumns: new[] { "restaurant_id", "code" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_dish_badges_dishes_dish_id_restaurant_id",
                        columns: x => new { x.dish_id, x.restaurant_id },
                        principalSchema: "public",
                        principalTable: "dishes",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_dish_badges_dish_id_restaurant_id",
                schema: "public",
                table: "dish_badges",
                columns: new[] { "dish_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_dish_badges_restaurant_id_badge_code",
                schema: "public",
                table: "dish_badges",
                columns: new[] { "restaurant_id", "badge_code" });

            migrationBuilder.CreateIndex(
                name: "IX_dishes_category_id_display_order",
                schema: "public",
                table: "dishes",
                columns: new[] { "category_id", "display_order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_dishes_category_id_menu_id_restaurant_id",
                schema: "public",
                table: "dishes",
                columns: new[] { "category_id", "menu_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_dishes_id_restaurant_id",
                schema: "public",
                table: "dishes",
                columns: new[] { "id", "restaurant_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_dishes_media_asset_id_restaurant_id",
                schema: "public",
                table: "dishes",
                columns: new[] { "media_asset_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_dishes_restaurant_id_menu_id_category_id_is_active_archived~",
                schema: "public",
                table: "dishes",
                columns: new[] { "restaurant_id", "menu_id", "category_id", "is_active", "archived_at", "display_order" });

            migrationBuilder.CreateIndex(
                name: "IX_media_assets_id_restaurant_id",
                schema: "public",
                table: "media_assets",
                columns: new[] { "id", "restaurant_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_media_assets_restaurant_id",
                schema: "public",
                table: "media_assets",
                column: "restaurant_id");

            migrationBuilder.CreateIndex(
                name: "IX_media_variants_id_restaurant_id",
                schema: "public",
                table: "media_variants",
                columns: new[] { "id", "restaurant_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_media_variants_media_asset_id_restaurant_id",
                schema: "public",
                table: "media_variants",
                columns: new[] { "media_asset_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_media_variants_media_asset_id_width_height",
                schema: "public",
                table: "media_variants",
                columns: new[] { "media_asset_id", "width", "height" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_menu_categories_id_menu_id_restaurant_id",
                schema: "public",
                table: "menu_categories",
                columns: new[] { "id", "menu_id", "restaurant_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_menu_categories_menu_id_display_order",
                schema: "public",
                table: "menu_categories",
                columns: new[] { "menu_id", "display_order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_menu_categories_menu_id_restaurant_id",
                schema: "public",
                table: "menu_categories",
                columns: new[] { "menu_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_menu_categories_restaurant_id_menu_id_is_active_display_ord~",
                schema: "public",
                table: "menu_categories",
                columns: new[] { "restaurant_id", "menu_id", "is_active", "display_order" });

            migrationBuilder.CreateIndex(
                name: "IX_menus_id_restaurant_id",
                schema: "public",
                table: "menus",
                columns: new[] { "id", "restaurant_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_menus_restaurant_id",
                schema: "public",
                table: "menus",
                column: "restaurant_id",
                unique: true,
                filter: "is_active");

            migrationBuilder.CreateIndex(
                name: "IX_publications_restaurant_id",
                schema: "public",
                table: "publications",
                column: "restaurant_id",
                unique: true,
                filter: "is_current");

            migrationBuilder.CreateIndex(
                name: "IX_publications_restaurant_id_version",
                schema: "public",
                table: "publications",
                columns: new[] { "restaurant_id", "version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_domains_host",
                schema: "public",
                table: "restaurant_domains",
                column: "host",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_domains_id_restaurant_id",
                schema: "public",
                table: "restaurant_domains",
                columns: new[] { "id", "restaurant_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_domains_restaurant_id",
                schema: "public",
                table: "restaurant_domains",
                column: "restaurant_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "dish_badges",
                schema: "public");

            migrationBuilder.DropTable(
                name: "media_variants",
                schema: "public");

            migrationBuilder.DropTable(
                name: "publications",
                schema: "public");

            migrationBuilder.DropTable(
                name: "restaurant_domains",
                schema: "public");

            migrationBuilder.DropTable(
                name: "restaurant_settings",
                schema: "public");

            migrationBuilder.DropTable(
                name: "badges",
                schema: "public");

            migrationBuilder.DropTable(
                name: "dishes",
                schema: "public");

            migrationBuilder.DropTable(
                name: "media_assets",
                schema: "public");

            migrationBuilder.DropTable(
                name: "menu_categories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "menus",
                schema: "public");

            migrationBuilder.DropTable(
                name: "restaurants",
                schema: "public");
        }
    }
}
