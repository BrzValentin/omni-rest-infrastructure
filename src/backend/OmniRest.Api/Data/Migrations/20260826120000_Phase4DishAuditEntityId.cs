using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniRest.Api.Data.Migrations;

/// <summary>
/// Phase 4 PR-12 Task 15 requires audit records to identify the dish that changed, so audit events
/// gain an optional entity identifier alongside the existing entity type and version.
/// </summary>
[DbContext(typeof(MenuDbContext))]
[Migration("20260826120000_Phase4DishAuditEntityId")]
public sealed class Phase4DishAuditEntityId : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "entity_id",
            schema: "public",
            table: "audit_events",
            type: "uuid",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "entity_id",
            schema: "public",
            table: "audit_events");
    }
}
