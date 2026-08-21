using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OmniRest.Api.Data.Migrations;

[DbContext(typeof(MenuDbContext))]
[Migration("20260820233806_RepairPublicationOutboxProcessingStatus")]
public sealed class RepairPublicationOutboxProcessingStatus : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "ck_publication_outbox_status",
            schema: "public",
            table: "publication_outbox");

        migrationBuilder.AddCheckConstraint(
            name: "ck_publication_outbox_status",
            schema: "public",
            table: "publication_outbox",
            sql: "status IN ('pending', 'processing', 'succeeded', 'failed')");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "ck_publication_outbox_status",
            schema: "public",
            table: "publication_outbox");

        migrationBuilder.Sql(
            "UPDATE public.publication_outbox SET status = 'pending' WHERE status = 'processing'");

        migrationBuilder.AddCheckConstraint(
            name: "ck_publication_outbox_status",
            schema: "public",
            table: "publication_outbox",
            sql: "status IN ('pending', 'succeeded', 'failed')");
    }
}
