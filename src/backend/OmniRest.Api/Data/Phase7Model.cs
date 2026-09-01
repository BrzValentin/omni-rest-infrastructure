using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace OmniRest.Api.Data;

/// <summary>
/// Rules for the restaurant slug that Phase 7 resolution uses as a subdomain label (PR-20 Task 2).
/// The slug is a tenant's identity on a shared platform domain, so it has to be a legal DNS label as
/// well as a legible URL segment.
/// </summary>
public static partial class RestaurantSlugs
{
    /// <summary>A DNS label is capped at 63 characters, and the slug is the whole label.</summary>
    public const int MaximumLength = 63;

    /// <summary>
    /// The SQL form of <see cref="Slug"/>. The model check constraint and the migration must hold this
    /// exact text, or the two silently drift apart.
    /// </summary>
    public const string CheckExpression =
        "slug IS NULL OR (length(slug) BETWEEN 1 AND 63 AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')";

    public static bool IsValid(string value) =>
        value.Length is > 0 and <= MaximumLength && Slug().IsMatch(value);

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$", RegexOptions.CultureInvariant)]
    private static partial Regex Slug();
}

public sealed partial class MenuDbContext
{
    /// <summary>
    /// The restaurant the current request acts for. This is exposed as a context property so EF Core
    /// rewrites it into a per-query parameter against the executing context, rather than baking one
    /// request's tenant into the cached model. Null while unbound, which makes every filter below
    /// inert — see <see cref="Infrastructure.ITenantScope"/> for why that is the correct default.
    /// </summary>
    public Guid? TenantRestaurantId => tenantScope?.RestaurantId;

    private void ConfigurePhase7(ModelBuilder modelBuilder)
    {
        ConfigureRestaurantSlug(modelBuilder);
        ConfigureTenantQueryFilters(modelBuilder);
    }

    private static void ConfigureRestaurantSlug(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<RestaurantEntity>();
        entity.Property(x => x.Slug).HasColumnName("slug").HasMaxLength(RestaurantSlugs.MaximumLength);

        // Unique but nullable: a restaurant reachable only through an explicit custom domain needs no
        // slug, while every slug that does exist must identify exactly one tenant.
        entity.HasIndex(x => x.Slug).IsUnique().HasFilter("slug IS NOT NULL");
        entity.ToTable(table => table.HasCheckConstraint("ck_restaurants_slug", RestaurantSlugs.CheckExpression));
    }

    /// <summary>
    /// Applies the ambient-tenant filter to every restaurant-owned entity (PR-20 Task 4). Adding a
    /// tenant-owned entity without adding it here is the one way to reintroduce a leak, so the list is
    /// exhaustive and <c>TenantIsolationApiTests</c> asserts every one of these tables is filtered.
    /// </summary>
    private void ConfigureTenantQueryFilters(ModelBuilder modelBuilder)
    {
        // The restaurant itself keys on Id; everything else carries RestaurantId.
        modelBuilder.Entity<RestaurantEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.Id == TenantRestaurantId);

        modelBuilder.Entity<RestaurantSettingsEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<RestaurantDomainEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<RestaurantMembershipEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<RestaurantAddressEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<RegularHourIntervalEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<SpecialHourEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<SpecialHourIntervalEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<SocialLinkEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<MediaAssetEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<MediaVariantEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<GalleryImageEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<MenuEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<MenuCategoryEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<DishEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<BadgeEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<DishBadgeEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<PublicationEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<PublicationOutboxEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
        modelBuilder.Entity<AuditEventEntity>()
            .HasQueryFilter(x => TenantRestaurantId == null || x.RestaurantId == TenantRestaurantId);
    }
}
