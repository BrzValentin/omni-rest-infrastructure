using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace OmniRest.Api.Data;

public sealed class OwnerUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = null!;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DisabledAt { get; set; }
    public DateTimeOffset? CurrentSessionStartedAt { get; set; }
    public ICollection<RestaurantMembershipEntity> Memberships { get; } = [];
}

public sealed class RestaurantMembershipEntity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid RestaurantId { get; set; }
    public string Role { get; set; } = MembershipRoles.Owner;
    public string Status { get; set; } = MembershipStatuses.Active;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public OwnerUser User { get; set; } = null!;
    public RestaurantEntity Restaurant { get; set; } = null!;
}

public sealed class RestaurantAddressEntity
{
    public Guid RestaurantId { get; set; }
    public string Line1 { get; set; } = null!;
    public string? Line2 { get; set; }
    public string City { get; set; } = null!;
    public string Region { get; set; } = null!;
    public string PostalCode { get; set; } = null!;
    public string CountryCode { get; set; } = null!;
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public RestaurantEntity Restaurant { get; set; } = null!;
}

public sealed class RegularHourIntervalEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public int DayOfWeek { get; set; }
    public TimeOnly OpensAt { get; set; }
    public TimeOnly ClosesAt { get; set; }
    public int DisplayOrder { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public RestaurantEntity Restaurant { get; set; } = null!;
}

public sealed class SpecialHourEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public DateOnly Date { get; set; }
    public bool IsClosed { get; set; }
    public string? Note { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public RestaurantEntity Restaurant { get; set; } = null!;
    public ICollection<SpecialHourIntervalEntity> Intervals { get; } = [];
}

public sealed class SpecialHourIntervalEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid SpecialHourId { get; set; }
    public TimeOnly OpensAt { get; set; }
    public TimeOnly ClosesAt { get; set; }
    public int DisplayOrder { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public SpecialHourEntity SpecialHour { get; set; } = null!;
}

public sealed class SocialLinkEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public string Platform { get; set; } = null!;
    public string Url { get; set; } = null!;
    public long ConcurrencyVersion { get; set; } = 1;
    public RestaurantEntity Restaurant { get; set; } = null!;
}

public sealed class PublicationOutboxEntity
{
    public Guid OperationId { get; set; }
    public Guid RestaurantId { get; set; }
    public long DraftVersion { get; set; }
    public string DraftSnapshotJson { get; set; } = null!;
    public string Status { get; set; } = PublicationStatuses.Pending;
    public int AttemptCount { get; set; }
    public string? ErrorCode { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public RestaurantEntity Restaurant { get; set; } = null!;
}

public sealed class AuditEventEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid ActorUserId { get; set; }
    public string Action { get; set; } = null!;
    public string EntityType { get; set; } = null!;
    public string EntityVersion { get; set; } = null!;
    public Guid? OperationId { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
}

public static class MembershipRoles
{
    public const string Owner = "owner";
}

public static class MembershipStatuses
{
    public const string Active = "active";
    public const string Revoked = "revoked";
}

public static class PublicationStatuses
{
    public const string Pending = "pending";
    public const string Processing = "processing";
    public const string Succeeded = "succeeded";
    public const string Failed = "failed";
}

public sealed partial class MenuDbContext
{
    private static void ConfigurePhase3(ModelBuilder modelBuilder)
    {
        ConfigureIdentity(modelBuilder);
        ConfigureMembership(modelBuilder);
        ConfigureAddress(modelBuilder);
        ConfigureRegularHours(modelBuilder);
        ConfigureSpecialHours(modelBuilder);
        ConfigureSocialLinks(modelBuilder);
        ConfigureOutbox(modelBuilder);
        ConfigureAudit(modelBuilder);

        modelBuilder.Entity<RestaurantEntity>()
            .HasOne(x => x.MainMediaAsset).WithMany()
            .HasForeignKey(x => new { x.MainMediaAssetId, x.Id })
            .HasPrincipalKey(x => new { x.Id, x.RestaurantId })
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<RestaurantEntity>().ToTable(table =>
        {
            table.HasCheckConstraint("ck_restaurants_draft_version", "draft_version > 0");
            table.HasCheckConstraint("ck_restaurants_phone_e164", "phone_e164 IS NULL OR phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'");
        });
        modelBuilder.Entity<MediaAssetEntity>().ToTable(table =>
            table.HasCheckConstraint("ck_media_assets_processing_status", "processing_status IN ('pending', 'ready', 'failed')"));
    }

    private static void ConfigureIdentity(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<OwnerUser>(entity =>
        {
            entity.ToTable("owner_users");
            entity.Property(x => x.DisplayName).HasColumnName("display_name").HasMaxLength(120).IsRequired();
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.DisabledAt).HasColumnName("disabled_at");
            entity.Property(x => x.CurrentSessionStartedAt).HasColumnName("current_session_started_at");
        });
        modelBuilder.Entity<IdentityRole<Guid>>().ToTable("owner_roles");
        modelBuilder.Entity<IdentityUserRole<Guid>>().ToTable("owner_user_roles");
        modelBuilder.Entity<IdentityUserClaim<Guid>>().ToTable("owner_user_claims");
        modelBuilder.Entity<IdentityUserLogin<Guid>>().ToTable("owner_user_logins");
        modelBuilder.Entity<IdentityRoleClaim<Guid>>().ToTable("owner_role_claims");
        modelBuilder.Entity<IdentityUserToken<Guid>>().ToTable("owner_user_tokens");
    }

    private static void ConfigureMembership(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<RestaurantMembershipEntity>();
        entity.ToTable("restaurant_memberships", table =>
        {
            table.HasCheckConstraint("ck_restaurant_memberships_role", "role IN ('owner')");
            table.HasCheckConstraint("ck_restaurant_memberships_status", "status IN ('active', 'revoked')");
        });
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.UserId).HasColumnName("user_id");
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.Role).HasColumnName("role").HasMaxLength(30).IsRequired();
        entity.Property(x => x.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
        entity.Property(x => x.CreatedAt).HasColumnName("created_at");
        entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        entity.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        entity.HasIndex(x => new { x.UserId, x.RestaurantId }).IsUnique();
        entity.HasIndex(x => new { x.RestaurantId, x.Status });
        entity.HasOne(x => x.User).WithMany(x => x.Memberships).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        entity.HasOne(x => x.Restaurant).WithMany(x => x.Memberships).HasForeignKey(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);
    }

    private static void ConfigureAddress(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<RestaurantAddressEntity>();
        entity.ToTable("restaurant_addresses", table =>
        {
            table.HasCheckConstraint("ck_restaurant_addresses_coordinates", "(latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)");
        });
        entity.HasKey(x => x.RestaurantId);
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.Line1).HasColumnName("line1").HasMaxLength(160).IsRequired();
        entity.Property(x => x.Line2).HasColumnName("line2").HasMaxLength(160);
        entity.Property(x => x.City).HasColumnName("city").HasMaxLength(100).IsRequired();
        entity.Property(x => x.Region).HasColumnName("region").HasMaxLength(100).IsRequired();
        entity.Property(x => x.PostalCode).HasColumnName("postal_code").HasMaxLength(20).IsRequired();
        entity.Property(x => x.CountryCode).HasColumnName("country_code").HasMaxLength(2).IsFixedLength().IsRequired();
        entity.Property(x => x.Latitude).HasColumnName("latitude").HasPrecision(9, 6);
        entity.Property(x => x.Longitude).HasColumnName("longitude").HasPrecision(9, 6);
        entity.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        entity.HasOne(x => x.Restaurant).WithOne(x => x.Address).HasForeignKey<RestaurantAddressEntity>(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);
    }

    private static void ConfigureRegularHours(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<RegularHourIntervalEntity>();
        entity.ToTable("regular_hour_intervals", table =>
        {
            table.HasCheckConstraint("ck_regular_hours_day", "day_of_week BETWEEN 0 AND 6");
            table.HasCheckConstraint("ck_regular_hours_duration", "opens_at <> closes_at");
            table.HasCheckConstraint("ck_regular_hours_order", "display_order >= 0");
        });
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.DayOfWeek).HasColumnName("day_of_week");
        entity.Property(x => x.OpensAt).HasColumnName("opens_at");
        entity.Property(x => x.ClosesAt).HasColumnName("closes_at");
        entity.Property(x => x.DisplayOrder).HasColumnName("display_order");
        entity.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        entity.HasIndex(x => new { x.RestaurantId, x.DayOfWeek, x.DisplayOrder }).IsUnique();
        entity.HasOne(x => x.Restaurant).WithMany(x => x.RegularHours).HasForeignKey(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);
    }

    private static void ConfigureSpecialHours(ModelBuilder modelBuilder)
    {
        var special = modelBuilder.Entity<SpecialHourEntity>();
        special.ToTable("special_hours", table =>
            table.HasCheckConstraint("ck_special_hours_note", "note IS NULL OR length(btrim(note)) > 0"));
        special.HasKey(x => x.Id);
        special.Property(x => x.Id).HasColumnName("id");
        special.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        special.Property(x => x.Date).HasColumnName("date");
        special.Property(x => x.IsClosed).HasColumnName("is_closed");
        special.Property(x => x.Note).HasColumnName("note").HasMaxLength(200);
        special.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        special.HasIndex(x => new { x.RestaurantId, x.Date }).IsUnique();
        special.HasIndex(x => new { x.Id, x.RestaurantId }).IsUnique();
        special.HasOne(x => x.Restaurant).WithMany(x => x.SpecialHours).HasForeignKey(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);

        var interval = modelBuilder.Entity<SpecialHourIntervalEntity>();
        interval.ToTable("special_hour_intervals", table =>
        {
            table.HasCheckConstraint("ck_special_hour_intervals_duration", "opens_at <> closes_at");
            table.HasCheckConstraint("ck_special_hour_intervals_order", "display_order >= 0");
        });
        interval.HasKey(x => x.Id);
        interval.Property(x => x.Id).HasColumnName("id");
        interval.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        interval.Property(x => x.SpecialHourId).HasColumnName("special_hour_id");
        interval.Property(x => x.OpensAt).HasColumnName("opens_at");
        interval.Property(x => x.ClosesAt).HasColumnName("closes_at");
        interval.Property(x => x.DisplayOrder).HasColumnName("display_order");
        interval.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        interval.HasIndex(x => new { x.SpecialHourId, x.DisplayOrder }).IsUnique();
        interval.HasOne(x => x.SpecialHour).WithMany(x => x.Intervals)
            .HasForeignKey(x => new { x.SpecialHourId, x.RestaurantId })
            .HasPrincipalKey(x => new { x.Id, x.RestaurantId }).OnDelete(DeleteBehavior.Cascade);
    }

    private static void ConfigureSocialLinks(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<SocialLinkEntity>();
        entity.ToTable("social_links", table =>
            table.HasCheckConstraint("ck_social_links_platform", "platform IN ('instagram', 'facebook', 'tiktok', 'google_business')"));
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.Platform).HasColumnName("platform").HasMaxLength(30).IsRequired();
        entity.Property(x => x.Url).HasColumnName("url").HasMaxLength(2048).IsRequired();
        entity.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        entity.HasIndex(x => new { x.RestaurantId, x.Platform }).IsUnique();
        entity.HasOne(x => x.Restaurant).WithMany(x => x.SocialLinks).HasForeignKey(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);
    }

    private static void ConfigureOutbox(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<PublicationOutboxEntity>();
        entity.ToTable("publication_outbox", table =>
        {
            table.HasCheckConstraint("ck_publication_outbox_version", "draft_version > 0");
            table.HasCheckConstraint("ck_publication_outbox_status", "status IN ('pending', 'processing', 'succeeded', 'failed')");
            table.HasCheckConstraint("ck_publication_outbox_attempts", "attempt_count >= 0");
        });
        entity.HasKey(x => x.OperationId);
        entity.Property(x => x.OperationId).HasColumnName("operation_id");
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.DraftVersion).HasColumnName("draft_version");
        entity.Property(x => x.DraftSnapshotJson).HasColumnName("draft_snapshot").HasColumnType("jsonb").IsRequired();
        entity.Property(x => x.Status).HasColumnName("status").HasMaxLength(20).IsRequired();
        entity.Property(x => x.AttemptCount).HasColumnName("attempt_count");
        entity.Property(x => x.ErrorCode).HasColumnName("error_code").HasMaxLength(80);
        entity.Property(x => x.CreatedAt).HasColumnName("created_at");
        entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        entity.Property(x => x.CompletedAt).HasColumnName("completed_at");
        entity.HasIndex(x => new { x.RestaurantId, x.DraftVersion }).IsUnique();
        entity.HasIndex(x => new { x.Status, x.CreatedAt });
        entity.HasOne(x => x.Restaurant).WithMany().HasForeignKey(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);
    }

    private static void ConfigureAudit(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<AuditEventEntity>();
        entity.ToTable("audit_events");
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.ActorUserId).HasColumnName("actor_user_id");
        entity.Property(x => x.Action).HasColumnName("action").HasMaxLength(80).IsRequired();
        entity.Property(x => x.EntityType).HasColumnName("entity_type").HasMaxLength(80).IsRequired();
        entity.Property(x => x.EntityVersion).HasColumnName("entity_version").HasMaxLength(80).IsRequired();
        entity.Property(x => x.OperationId).HasColumnName("operation_id");
        entity.Property(x => x.OccurredAt).HasColumnName("occurred_at");
        entity.HasIndex(x => new { x.RestaurantId, x.OccurredAt });
    }
}
