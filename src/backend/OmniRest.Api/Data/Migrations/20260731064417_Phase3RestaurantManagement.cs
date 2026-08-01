using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace OmniRest.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Phase3RestaurantManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "description",
                schema: "public",
                table: "restaurants",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "draft_version",
                schema: "public",
                table: "restaurants",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.AddColumn<string>(
                name: "email",
                schema: "public",
                table: "restaurants",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "main_media_asset_id",
                schema: "public",
                table: "restaurants",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "phone_display",
                schema: "public",
                table: "restaurants",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "phone_e164",
                schema: "public",
                table: "restaurants",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "time_zone_id",
                schema: "public",
                table: "restaurant_settings",
                type: "character varying(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "America/Winnipeg");

            migrationBuilder.AddColumn<Guid>(
                name: "operation_id",
                schema: "public",
                table: "publications",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE public.restaurants AS restaurant
                SET draft_version = GREATEST(
                    restaurant.draft_version,
                    COALESCE((SELECT MAX(publication.version) FROM public.publications AS publication WHERE publication.restaurant_id = restaurant.id), 1));
                """);

            migrationBuilder.Sql(
                """
                UPDATE public.publications AS publication
                SET snapshot = publication.snapshot || jsonb_build_object(
                    'restaurant', jsonb_build_object(
                        'id', restaurant.id::text,
                        'name', restaurant.name,
                        'shortDescription', NULL,
                        'phone', NULL,
                        'email', NULL,
                        'timeZone', settings.time_zone_id,
                        'address', NULL,
                        'regularHours', '[]'::jsonb,
                        'specialHours', '[]'::jsonb,
                        'status', jsonb_build_object(
                            'state', 'closed',
                            'label', 'Closed',
                            'nextChangeAt', NULL,
                            'source', 'regularHours'),
                        'socialLinks', '[]'::jsonb,
                        'mainImage', NULL,
                        'publicationVersion', publication.version::text))
                FROM public.restaurants AS restaurant
                JOIN public.restaurant_settings AS settings ON settings.restaurant_id = restaurant.id
                WHERE publication.restaurant_id = restaurant.id
                  AND NOT (publication.snapshot ? 'restaurant');
                """);

            migrationBuilder.AddColumn<string>(
                name: "processing_status",
                schema: "public",
                table: "media_assets",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "ready");

            migrationBuilder.CreateTable(
                name: "audit_events",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    actor_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    action = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    entity_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    entity_version = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    operation_id = table.Column<Guid>(type: "uuid", nullable: true),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_events", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "owner_roles",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ConcurrencyStamp = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_owner_roles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "owner_users",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    display_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    disabled_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    current_session_started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UserName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedUserName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    Email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    NormalizedEmail = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    EmailConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    PasswordHash = table.Column<string>(type: "text", nullable: true),
                    SecurityStamp = table.Column<string>(type: "text", nullable: true),
                    ConcurrencyStamp = table.Column<string>(type: "text", nullable: true),
                    PhoneNumber = table.Column<string>(type: "text", nullable: true),
                    PhoneNumberConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    TwoFactorEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    LockoutEnd = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LockoutEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AccessFailedCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_owner_users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "publication_outbox",
                schema: "public",
                columns: table => new
                {
                    operation_id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    draft_version = table.Column<long>(type: "bigint", nullable: false),
                    draft_snapshot = table.Column<string>(type: "jsonb", nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    attempt_count = table.Column<int>(type: "integer", nullable: false),
                    error_code = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_publication_outbox", x => x.operation_id);
                    table.CheckConstraint("ck_publication_outbox_attempts", "attempt_count >= 0");
                    table.CheckConstraint("ck_publication_outbox_status", "status IN ('pending', 'processing', 'succeeded', 'failed')");
                    table.CheckConstraint("ck_publication_outbox_version", "draft_version > 0");
                    table.ForeignKey(
                        name: "FK_publication_outbox_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "regular_hour_intervals",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    day_of_week = table.Column<int>(type: "integer", nullable: false),
                    opens_at = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    closes_at = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_regular_hour_intervals", x => x.id);
                    table.CheckConstraint("ck_regular_hours_day", "day_of_week BETWEEN 0 AND 6");
                    table.CheckConstraint("ck_regular_hours_duration", "opens_at <> closes_at");
                    table.CheckConstraint("ck_regular_hours_order", "display_order >= 0");
                    table.ForeignKey(
                        name: "FK_regular_hour_intervals_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "restaurant_addresses",
                schema: "public",
                columns: table => new
                {
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    line1 = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    line2 = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: true),
                    city = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    region = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    postal_code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    country_code = table.Column<string>(type: "character(2)", fixedLength: true, maxLength: 2, nullable: false),
                    latitude = table.Column<decimal>(type: "numeric(9,6)", precision: 9, scale: 6, nullable: true),
                    longitude = table.Column<decimal>(type: "numeric(9,6)", precision: 9, scale: 6, nullable: true),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_restaurant_addresses", x => x.restaurant_id);
                    table.CheckConstraint("ck_restaurant_addresses_coordinates", "(latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)");
                    table.ForeignKey(
                        name: "FK_restaurant_addresses_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "social_links",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    platform = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_social_links", x => x.id);
                    table.CheckConstraint("ck_social_links_platform", "platform IN ('instagram', 'facebook', 'tiktok', 'google_business')");
                    table.ForeignKey(
                        name: "FK_social_links_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "special_hours",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    date = table.Column<DateOnly>(type: "date", nullable: false),
                    is_closed = table.Column<bool>(type: "boolean", nullable: false),
                    note = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_special_hours", x => x.id);
                    table.UniqueConstraint("AK_special_hours_id_restaurant_id", x => new { x.id, x.restaurant_id });
                    table.CheckConstraint("ck_special_hours_note", "note IS NULL OR length(btrim(note)) > 0");
                    table.ForeignKey(
                        name: "FK_special_hours_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "owner_role_claims",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClaimType = table.Column<string>(type: "text", nullable: true),
                    ClaimValue = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_owner_role_claims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_owner_role_claims_owner_roles_RoleId",
                        column: x => x.RoleId,
                        principalSchema: "public",
                        principalTable: "owner_roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "owner_user_claims",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClaimType = table.Column<string>(type: "text", nullable: true),
                    ClaimValue = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_owner_user_claims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_owner_user_claims_owner_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "public",
                        principalTable: "owner_users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "owner_user_logins",
                schema: "public",
                columns: table => new
                {
                    LoginProvider = table.Column<string>(type: "text", nullable: false),
                    ProviderKey = table.Column<string>(type: "text", nullable: false),
                    ProviderDisplayName = table.Column<string>(type: "text", nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_owner_user_logins", x => new { x.LoginProvider, x.ProviderKey });
                    table.ForeignKey(
                        name: "FK_owner_user_logins_owner_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "public",
                        principalTable: "owner_users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "owner_user_roles",
                schema: "public",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_owner_user_roles", x => new { x.UserId, x.RoleId });
                    table.ForeignKey(
                        name: "FK_owner_user_roles_owner_roles_RoleId",
                        column: x => x.RoleId,
                        principalSchema: "public",
                        principalTable: "owner_roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_owner_user_roles_owner_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "public",
                        principalTable: "owner_users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "owner_user_tokens",
                schema: "public",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    LoginProvider = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Value = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_owner_user_tokens", x => new { x.UserId, x.LoginProvider, x.Name });
                    table.ForeignKey(
                        name: "FK_owner_user_tokens_owner_users_UserId",
                        column: x => x.UserId,
                        principalSchema: "public",
                        principalTable: "owner_users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "restaurant_memberships",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_restaurant_memberships", x => x.id);
                    table.CheckConstraint("ck_restaurant_memberships_role", "role IN ('owner')");
                    table.CheckConstraint("ck_restaurant_memberships_status", "status IN ('active', 'revoked')");
                    table.ForeignKey(
                        name: "FK_restaurant_memberships_owner_users_user_id",
                        column: x => x.user_id,
                        principalSchema: "public",
                        principalTable: "owner_users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_restaurant_memberships_restaurants_restaurant_id",
                        column: x => x.restaurant_id,
                        principalSchema: "public",
                        principalTable: "restaurants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "special_hour_intervals",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    restaurant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    special_hour_id = table.Column<Guid>(type: "uuid", nullable: false),
                    opens_at = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    closes_at = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    display_order = table.Column<int>(type: "integer", nullable: false),
                    concurrency_version = table.Column<long>(type: "bigint", nullable: false, defaultValue: 1L)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_special_hour_intervals", x => x.id);
                    table.CheckConstraint("ck_special_hour_intervals_duration", "opens_at <> closes_at");
                    table.CheckConstraint("ck_special_hour_intervals_order", "display_order >= 0");
                    table.ForeignKey(
                        name: "FK_special_hour_intervals_special_hours_special_hour_id_restau~",
                        columns: x => new { x.special_hour_id, x.restaurant_id },
                        principalSchema: "public",
                        principalTable: "special_hours",
                        principalColumns: new[] { "id", "restaurant_id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_restaurants_main_media_asset_id_id",
                schema: "public",
                table: "restaurants",
                columns: new[] { "main_media_asset_id", "id" });

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurants_draft_version",
                schema: "public",
                table: "restaurants",
                sql: "draft_version > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_restaurants_phone_e164",
                schema: "public",
                table: "restaurants",
                sql: "phone_e164 IS NULL OR phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'");

            migrationBuilder.CreateIndex(
                name: "IX_publications_operation_id",
                schema: "public",
                table: "publications",
                column: "operation_id",
                unique: true,
                filter: "operation_id IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_media_assets_processing_status",
                schema: "public",
                table: "media_assets",
                sql: "processing_status IN ('pending', 'ready', 'failed')");

            migrationBuilder.CreateIndex(
                name: "IX_audit_events_restaurant_id_occurred_at",
                schema: "public",
                table: "audit_events",
                columns: new[] { "restaurant_id", "occurred_at" });

            migrationBuilder.CreateIndex(
                name: "IX_owner_role_claims_RoleId",
                schema: "public",
                table: "owner_role_claims",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "RoleNameIndex",
                schema: "public",
                table: "owner_roles",
                column: "NormalizedName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_owner_user_claims_UserId",
                schema: "public",
                table: "owner_user_claims",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_owner_user_logins_UserId",
                schema: "public",
                table: "owner_user_logins",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_owner_user_roles_RoleId",
                schema: "public",
                table: "owner_user_roles",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "EmailIndex",
                schema: "public",
                table: "owner_users",
                column: "NormalizedEmail");

            migrationBuilder.CreateIndex(
                name: "UserNameIndex",
                schema: "public",
                table: "owner_users",
                column: "NormalizedUserName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_publication_outbox_restaurant_id_draft_version",
                schema: "public",
                table: "publication_outbox",
                columns: new[] { "restaurant_id", "draft_version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_publication_outbox_status_created_at",
                schema: "public",
                table: "publication_outbox",
                columns: new[] { "status", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_regular_hour_intervals_restaurant_id_day_of_week_display_or~",
                schema: "public",
                table: "regular_hour_intervals",
                columns: new[] { "restaurant_id", "day_of_week", "display_order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_memberships_restaurant_id_status",
                schema: "public",
                table: "restaurant_memberships",
                columns: new[] { "restaurant_id", "status" });

            migrationBuilder.CreateIndex(
                name: "IX_restaurant_memberships_user_id_restaurant_id",
                schema: "public",
                table: "restaurant_memberships",
                columns: new[] { "user_id", "restaurant_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_social_links_restaurant_id_platform",
                schema: "public",
                table: "social_links",
                columns: new[] { "restaurant_id", "platform" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_special_hour_intervals_special_hour_id_display_order",
                schema: "public",
                table: "special_hour_intervals",
                columns: new[] { "special_hour_id", "display_order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_special_hour_intervals_special_hour_id_restaurant_id",
                schema: "public",
                table: "special_hour_intervals",
                columns: new[] { "special_hour_id", "restaurant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_special_hours_id_restaurant_id",
                schema: "public",
                table: "special_hours",
                columns: new[] { "id", "restaurant_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_special_hours_restaurant_id_date",
                schema: "public",
                table: "special_hours",
                columns: new[] { "restaurant_id", "date" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_restaurants_media_assets_main_media_asset_id_id",
                schema: "public",
                table: "restaurants",
                columns: new[] { "main_media_asset_id", "id" },
                principalSchema: "public",
                principalTable: "media_assets",
                principalColumns: new[] { "id", "restaurant_id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_restaurants_media_assets_main_media_asset_id_id",
                schema: "public",
                table: "restaurants");

            migrationBuilder.DropTable(
                name: "audit_events",
                schema: "public");

            migrationBuilder.DropTable(
                name: "owner_role_claims",
                schema: "public");

            migrationBuilder.DropTable(
                name: "owner_user_claims",
                schema: "public");

            migrationBuilder.DropTable(
                name: "owner_user_logins",
                schema: "public");

            migrationBuilder.DropTable(
                name: "owner_user_roles",
                schema: "public");

            migrationBuilder.DropTable(
                name: "owner_user_tokens",
                schema: "public");

            migrationBuilder.DropTable(
                name: "publication_outbox",
                schema: "public");

            migrationBuilder.DropTable(
                name: "regular_hour_intervals",
                schema: "public");

            migrationBuilder.DropTable(
                name: "restaurant_addresses",
                schema: "public");

            migrationBuilder.DropTable(
                name: "restaurant_memberships",
                schema: "public");

            migrationBuilder.DropTable(
                name: "social_links",
                schema: "public");

            migrationBuilder.DropTable(
                name: "special_hour_intervals",
                schema: "public");

            migrationBuilder.DropTable(
                name: "owner_roles",
                schema: "public");

            migrationBuilder.DropTable(
                name: "owner_users",
                schema: "public");

            migrationBuilder.DropTable(
                name: "special_hours",
                schema: "public");

            migrationBuilder.DropIndex(
                name: "IX_restaurants_main_media_asset_id_id",
                schema: "public",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurants_draft_version",
                schema: "public",
                table: "restaurants");

            migrationBuilder.DropCheckConstraint(
                name: "ck_restaurants_phone_e164",
                schema: "public",
                table: "restaurants");

            migrationBuilder.DropIndex(
                name: "IX_publications_operation_id",
                schema: "public",
                table: "publications");

            migrationBuilder.DropCheckConstraint(
                name: "ck_media_assets_processing_status",
                schema: "public",
                table: "media_assets");

            migrationBuilder.DropColumn(
                name: "description",
                schema: "public",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "draft_version",
                schema: "public",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "email",
                schema: "public",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "main_media_asset_id",
                schema: "public",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "phone_display",
                schema: "public",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "phone_e164",
                schema: "public",
                table: "restaurants");

            migrationBuilder.DropColumn(
                name: "time_zone_id",
                schema: "public",
                table: "restaurant_settings");

            migrationBuilder.DropColumn(
                name: "operation_id",
                schema: "public",
                table: "publications");

            migrationBuilder.DropColumn(
                name: "processing_status",
                schema: "public",
                table: "media_assets");
        }
    }
}
