using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniRest.Api.Data.Migrations;

[DbContext(typeof(MenuDbContext))]
[Migration("20260731044753_Pr7DishAvailability")]
public sealed class Pr7DishAvailability : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("UPDATE public.dishes SET availability_status = 'available' WHERE availability_status IS NULL;");

        migrationBuilder.AlterColumn<string>(
            name: "availability_status",
            schema: "public",
            table: "dishes",
            type: "character varying(20)",
            maxLength: 20,
            nullable: false,
            defaultValue: "available",
            oldClrType: typeof(string),
            oldType: "character varying(20)",
            oldMaxLength: 20,
            oldNullable: true);

        migrationBuilder.AddCheckConstraint(
            name: "ck_dishes_availability",
            schema: "public",
            table: "dishes",
            sql: "availability_status IN ('available', 'unavailable')");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "ck_dishes_availability",
            schema: "public",
            table: "dishes");

        migrationBuilder.AlterColumn<string>(
            name: "availability_status",
            schema: "public",
            table: "dishes",
            type: "character varying(20)",
            maxLength: 20,
            nullable: true,
            oldClrType: typeof(string),
            oldType: "character varying(20)",
            oldMaxLength: 20,
            oldDefaultValue: "available");
    }
}
