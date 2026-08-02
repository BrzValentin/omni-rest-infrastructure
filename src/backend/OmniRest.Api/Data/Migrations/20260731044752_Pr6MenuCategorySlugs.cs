using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniRest.Api.Data.Migrations;

[DbContext(typeof(MenuDbContext))]
[Migration("20260731044752_Pr6MenuCategorySlugs")]
public sealed class Pr6MenuCategorySlugs : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "slug",
            schema: "public",
            table: "menu_categories",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);

        migrationBuilder.Sql(
            """
            WITH raw_bases AS (
                SELECT id,
                       menu_id,
                       COALESCE(
                           NULLIF(trim(BOTH '-' FROM regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''),
                           'category-' || left(replace(id::text, '-', ''), 8)
                       ) AS base_slug
                FROM public.menu_categories
            ), bases AS (
                SELECT id,
                       menu_id,
                       trim(TRAILING '-' FROM left(base_slug, 91)) AS base_slug
                FROM raw_bases
            ), ranked AS (
                SELECT id,
                       base_slug,
                       row_number() OVER (PARTITION BY menu_id, base_slug ORDER BY id) AS occurrence
                FROM bases
            )
            UPDATE public.menu_categories AS category
            SET slug = CASE
                WHEN ranked.occurrence = 1 THEN ranked.base_slug
                ELSE trim(TRAILING '-' FROM left(ranked.base_slug, 67)) || '-' || replace(category.id::text, '-', '')
            END
            FROM ranked
            WHERE category.id = ranked.id;
            """);

        migrationBuilder.AlterColumn<string>(
            name: "slug",
            schema: "public",
            table: "menu_categories",
            type: "character varying(100)",
            maxLength: 100,
            nullable: false,
            oldClrType: typeof(string),
            oldType: "character varying(100)",
            oldMaxLength: 100,
            oldNullable: true);

        migrationBuilder.AddCheckConstraint(
            name: "ck_menu_categories_slug",
            schema: "public",
            table: "menu_categories",
            sql: "slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'");

        migrationBuilder.CreateIndex(
            name: "IX_menu_categories_menu_id_slug",
            schema: "public",
            table: "menu_categories",
            columns: new[] { "menu_id", "slug" },
            unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "IX_menu_categories_menu_id_slug",
            schema: "public",
            table: "menu_categories");
        migrationBuilder.DropCheckConstraint(
            name: "ck_menu_categories_slug",
            schema: "public",
            table: "menu_categories");
        migrationBuilder.DropColumn(
            name: "slug",
            schema: "public",
            table: "menu_categories");
    }
}
