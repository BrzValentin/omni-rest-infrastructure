using Microsoft.EntityFrameworkCore;
using OmniRest.Api.Menus;

namespace OmniRest.Api.Data;

public sealed class MenuDbContext(DbContextOptions<MenuDbContext> options) : DbContext(options)
{
    public DbSet<RestaurantEntity> Restaurants => Set<RestaurantEntity>();
    public DbSet<RestaurantSettingsEntity> RestaurantSettings => Set<RestaurantSettingsEntity>();
    public DbSet<RestaurantDomainEntity> RestaurantDomains => Set<RestaurantDomainEntity>();
    public DbSet<MediaAssetEntity> MediaAssets => Set<MediaAssetEntity>();
    public DbSet<MediaVariantEntity> MediaVariants => Set<MediaVariantEntity>();
    public DbSet<MenuEntity> Menus => Set<MenuEntity>();
    public DbSet<MenuCategoryEntity> MenuCategories => Set<MenuCategoryEntity>();
    public DbSet<DishEntity> Dishes => Set<DishEntity>();
    public DbSet<BadgeEntity> Badges => Set<BadgeEntity>();
    public DbSet<DishBadgeEntity> DishBadges => Set<DishBadgeEntity>();
    public DbSet<PublicationEntity> Publications => Set<PublicationEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("public");
        ConfigureRestaurant(modelBuilder.Entity<RestaurantEntity>());
        ConfigureSettings(modelBuilder.Entity<RestaurantSettingsEntity>());
        ConfigureDomain(modelBuilder.Entity<RestaurantDomainEntity>());
        ConfigureMedia(modelBuilder.Entity<MediaAssetEntity>(), modelBuilder.Entity<MediaVariantEntity>());
        ConfigureMenu(modelBuilder.Entity<MenuEntity>());
        ConfigureCategory(modelBuilder.Entity<MenuCategoryEntity>());
        ConfigureDish(modelBuilder.Entity<DishEntity>());
        ConfigureBadges(modelBuilder.Entity<BadgeEntity>(), modelBuilder.Entity<DishBadgeEntity>());
        ConfigurePublication(modelBuilder.Entity<PublicationEntity>());
    }

    private static void ConfigureRestaurant(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<RestaurantEntity> entity)
    {
        entity.ToTable("restaurants");
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(120).IsRequired();
        entity.Property(x => x.CreatedAt).HasColumnName("created_at");
        entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        entity.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        entity.ToTable(table => table.HasCheckConstraint("ck_restaurants_name", "length(btrim(name)) > 0"));
    }

    private static void ConfigureSettings(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<RestaurantSettingsEntity> entity)
    {
        entity.ToTable("restaurant_settings");
        entity.HasKey(x => x.RestaurantId);
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.Locale).HasColumnName("locale").HasMaxLength(35).IsRequired();
        entity.Property(x => x.Currency).HasColumnName("currency").HasMaxLength(3).IsFixedLength().IsRequired();
        entity.Property(x => x.TaxDisplayMode).HasColumnName("tax_display_mode").HasMaxLength(10).IsRequired();
        entity.Property(x => x.TaxNoticeKey).HasColumnName("tax_notice_key").HasMaxLength(100);
        entity.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        entity.HasOne(x => x.Restaurant).WithOne(x => x.Settings).HasForeignKey<RestaurantSettingsEntity>(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);
        entity.ToTable(table => table.HasCheckConstraint("ck_restaurant_settings_tax_mode", "tax_display_mode IN ('inclusive', 'exclusive')"));
    }

    private static void ConfigureDomain(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<RestaurantDomainEntity> entity)
    {
        entity.ToTable("restaurant_domains");
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.Host).HasColumnName("host").HasMaxLength(253).IsRequired();
        entity.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        entity.HasIndex(x => x.Host).IsUnique();
        entity.HasIndex(x => new { x.Id, x.RestaurantId }).IsUnique();
        entity.HasOne(x => x.Restaurant).WithMany(x => x.Domains).HasForeignKey(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);
        entity.ToTable(table => table.HasCheckConstraint("ck_restaurant_domains_normalized", "host = lower(host) AND host !~ '[:/\\s]'"));
    }

    private static void ConfigureMedia(
        Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<MediaAssetEntity> asset,
        Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<MediaVariantEntity> variant)
    {
        asset.ToTable("media_assets");
        asset.HasKey(x => x.Id);
        asset.Property(x => x.Id).HasColumnName("id");
        asset.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        asset.Property(x => x.AltText).HasColumnName("alt_text").HasMaxLength(300).IsRequired();
        asset.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        asset.HasIndex(x => new { x.Id, x.RestaurantId }).IsUnique();
        asset.HasOne(x => x.Restaurant).WithMany().HasForeignKey(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);

        variant.ToTable("media_variants");
        variant.HasKey(x => x.Id);
        variant.Property(x => x.Id).HasColumnName("id");
        variant.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        variant.Property(x => x.MediaAssetId).HasColumnName("media_asset_id");
        variant.Property(x => x.Url).HasColumnName("url").HasMaxLength(2048).IsRequired();
        variant.Property(x => x.Width).HasColumnName("width");
        variant.Property(x => x.Height).HasColumnName("height");
        variant.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        variant.HasIndex(x => new { x.Id, x.RestaurantId }).IsUnique();
        variant.HasIndex(x => new { x.MediaAssetId, x.Width, x.Height }).IsUnique();
        variant.HasOne(x => x.MediaAsset).WithMany(x => x.Variants)
            .HasForeignKey(x => new { x.MediaAssetId, x.RestaurantId })
            .HasPrincipalKey(x => new { x.Id, x.RestaurantId }).OnDelete(DeleteBehavior.Cascade);
        variant.ToTable(table => table.HasCheckConstraint("ck_media_variants_dimensions", "width > 0 AND height > 0"));
    }

    private static void ConfigureMenu(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<MenuEntity> entity)
    {
        entity.ToTable("menus");
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
        entity.Property(x => x.IsActive).HasColumnName("is_active");
        entity.Property(x => x.CreatedAt).HasColumnName("created_at");
        entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        entity.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        entity.HasIndex(x => new { x.Id, x.RestaurantId }).IsUnique();
        entity.HasIndex(x => x.RestaurantId).IsUnique().HasFilter("is_active");
        entity.HasOne(x => x.Restaurant).WithMany(x => x.Menus).HasForeignKey(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);
        entity.ToTable(table => table.HasCheckConstraint("ck_menus_name", "length(btrim(name)) > 0"));
    }

    private static void ConfigureCategory(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<MenuCategoryEntity> entity)
    {
        entity.ToTable("menu_categories");
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.MenuId).HasColumnName("menu_id");
        entity.Property(x => x.Slug).HasColumnName("slug").HasMaxLength(100).IsRequired();
        entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
        entity.Property(x => x.Description).HasColumnName("description").HasMaxLength(300);
        entity.Property(x => x.DisplayOrder).HasColumnName("display_order");
        entity.Property(x => x.IsActive).HasColumnName("is_active");
        entity.Property(x => x.CreatedAt).HasColumnName("created_at");
        entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        entity.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        entity.HasIndex(x => new { x.Id, x.MenuId, x.RestaurantId }).IsUnique();
        entity.HasIndex(x => new { x.MenuId, x.Slug }).IsUnique();
        entity.HasIndex(x => new { x.MenuId, x.DisplayOrder }).IsUnique();
        entity.HasIndex(x => new { x.RestaurantId, x.MenuId, x.IsActive, x.DisplayOrder });
        entity.HasOne(x => x.Menu).WithMany(x => x.Categories)
            .HasForeignKey(x => new { x.MenuId, x.RestaurantId })
            .HasPrincipalKey(x => new { x.Id, x.RestaurantId }).OnDelete(DeleteBehavior.Cascade);
        entity.ToTable(table =>
        {
            table.HasCheckConstraint("ck_menu_categories_name", "length(btrim(name)) > 0");
            table.HasCheckConstraint("ck_menu_categories_slug", "slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'");
            table.HasCheckConstraint("ck_menu_categories_display_order", "display_order >= 0");
        });
    }

    private static void ConfigureDish(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<DishEntity> entity)
    {
        entity.ToTable("dishes");
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.MenuId).HasColumnName("menu_id");
        entity.Property(x => x.CategoryId).HasColumnName("category_id");
        entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(160).IsRequired();
        entity.Property(x => x.Description).HasColumnName("description").HasMaxLength(1000);
        entity.Property(x => x.Price).HasColumnName("price").HasPrecision(12, 2);
        entity.Property(x => x.MediaAssetId).HasColumnName("media_asset_id");
        entity.Property(x => x.Availability).HasColumnName("availability_status").HasMaxLength(20).HasDefaultValue(AvailabilityStatus.Available).IsRequired();
        entity.Property(x => x.IsActive).HasColumnName("is_active");
        entity.Property(x => x.DisplayOrder).HasColumnName("display_order");
        entity.Property(x => x.ArchivedAt).HasColumnName("archived_at");
        entity.Property(x => x.CreatedAt).HasColumnName("created_at");
        entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        entity.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        entity.HasIndex(x => new { x.Id, x.RestaurantId }).IsUnique();
        entity.HasIndex(x => new { x.CategoryId, x.DisplayOrder }).IsUnique();
        entity.HasIndex(x => new { x.RestaurantId, x.MenuId, x.CategoryId, x.IsActive, x.ArchivedAt, x.DisplayOrder });
        entity.HasOne(x => x.Category).WithMany(x => x.Dishes)
            .HasForeignKey(x => new { x.CategoryId, x.MenuId, x.RestaurantId })
            .HasPrincipalKey(x => new { x.Id, x.MenuId, x.RestaurantId }).OnDelete(DeleteBehavior.Cascade);
        entity.HasOne(x => x.MediaAsset).WithMany()
            .HasForeignKey(x => new { x.MediaAssetId, x.RestaurantId })
            .HasPrincipalKey(x => new { x.Id, x.RestaurantId }).OnDelete(DeleteBehavior.Restrict);
        entity.ToTable(table =>
        {
            table.HasCheckConstraint("ck_dishes_name", "length(btrim(name)) > 0");
            table.HasCheckConstraint("ck_dishes_price", "price >= 0");
            table.HasCheckConstraint("ck_dishes_display_order", "display_order >= 0");
            table.HasCheckConstraint("ck_dishes_availability", "availability_status IN ('available', 'unavailable')");
        });
    }

    private static void ConfigureBadges(
        Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<BadgeEntity> badge,
        Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<DishBadgeEntity> assignment)
    {
        badge.ToTable("badges");
        badge.HasKey(x => new { x.RestaurantId, x.Code });
        badge.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        badge.Property(x => x.Code).HasColumnName("code").HasMaxLength(40);
        badge.Property(x => x.LabelKey).HasColumnName("label_key").HasMaxLength(100).IsRequired();
        badge.Property(x => x.Category).HasColumnName("category").HasMaxLength(20).IsRequired();
        badge.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version").HasDefaultValue(1L).IsConcurrencyToken();
        badge.HasOne(x => x.Restaurant).WithMany().HasForeignKey(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);
        badge.ToTable(table => table.HasCheckConstraint("ck_badges_category", "category IN ('dietary', 'allergen', 'promotional', 'heat')"));

        assignment.ToTable("dish_badges");
        assignment.HasKey(x => new { x.RestaurantId, x.DishId, x.BadgeCode });
        assignment.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        assignment.Property(x => x.DishId).HasColumnName("dish_id");
        assignment.Property(x => x.BadgeCode).HasColumnName("badge_code").HasMaxLength(40);
        assignment.HasOne(x => x.Dish).WithMany(x => x.Badges)
            .HasForeignKey(x => new { x.DishId, x.RestaurantId })
            .HasPrincipalKey(x => new { x.Id, x.RestaurantId }).OnDelete(DeleteBehavior.Cascade);
        assignment.HasOne(x => x.Badge).WithMany()
            .HasForeignKey(x => new { x.RestaurantId, x.BadgeCode }).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePublication(Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder<PublicationEntity> entity)
    {
        entity.ToTable("publications");
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.Version).HasColumnName("version");
        entity.Property(x => x.SnapshotJson).HasColumnName("snapshot").HasColumnType("jsonb").IsRequired();
        entity.Property(x => x.IsCurrent).HasColumnName("is_current");
        entity.Property(x => x.PublishedAt).HasColumnName("published_at");
        entity.HasIndex(x => new { x.RestaurantId, x.Version }).IsUnique();
        entity.HasIndex(x => x.RestaurantId).IsUnique().HasFilter("is_current");
        entity.HasOne(x => x.Restaurant).WithMany(x => x.Publications).HasForeignKey(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);
        entity.ToTable(table => table.HasCheckConstraint("ck_publications_version", "version > 0"));
    }
}

public sealed class RestaurantEntity
{
    public Guid Id { get; set; }
    public string Name { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public RestaurantSettingsEntity Settings { get; set; } = null!;
    public ICollection<RestaurantDomainEntity> Domains { get; } = [];
    public ICollection<MenuEntity> Menus { get; } = [];
    public ICollection<PublicationEntity> Publications { get; } = [];
}

public sealed class RestaurantSettingsEntity
{
    public Guid RestaurantId { get; set; }
    public string Locale { get; set; } = null!;
    public string Currency { get; set; } = null!;
    public string TaxDisplayMode { get; set; } = null!;
    public string? TaxNoticeKey { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public RestaurantEntity Restaurant { get; set; } = null!;
}

public sealed class RestaurantDomainEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public string Host { get; set; } = null!;
    public long ConcurrencyVersion { get; set; } = 1;
    public RestaurantEntity Restaurant { get; set; } = null!;
}

public sealed class MediaAssetEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public string AltText { get; set; } = null!;
    public long ConcurrencyVersion { get; set; } = 1;
    public RestaurantEntity Restaurant { get; set; } = null!;
    public ICollection<MediaVariantEntity> Variants { get; } = [];
}

public sealed class MediaVariantEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid MediaAssetId { get; set; }
    public string Url { get; set; } = null!;
    public int Width { get; set; }
    public int Height { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public MediaAssetEntity MediaAsset { get; set; } = null!;
}

public sealed class MenuEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public string Name { get; set; } = null!;
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public RestaurantEntity Restaurant { get; set; } = null!;
    public ICollection<MenuCategoryEntity> Categories { get; } = [];
}

public sealed class MenuCategoryEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid MenuId { get; set; }
    public string Slug { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public MenuEntity Menu { get; set; } = null!;
    public ICollection<DishEntity> Dishes { get; } = [];
}

public sealed class DishEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid MenuId { get; set; }
    public Guid CategoryId { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public decimal Price { get; set; }
    public Guid? MediaAssetId { get; set; }
    public string Availability { get; set; } = AvailabilityStatus.Available;
    public bool IsActive { get; set; }
    public int DisplayOrder { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public MenuCategoryEntity Category { get; set; } = null!;
    public MediaAssetEntity? MediaAsset { get; set; }
    public ICollection<DishBadgeEntity> Badges { get; } = [];
}

public sealed class BadgeEntity
{
    public Guid RestaurantId { get; set; }
    public string Code { get; set; } = null!;
    public string LabelKey { get; set; } = null!;
    public string Category { get; set; } = null!;
    public long ConcurrencyVersion { get; set; } = 1;
    public RestaurantEntity Restaurant { get; set; } = null!;
}

public sealed class DishBadgeEntity
{
    public Guid RestaurantId { get; set; }
    public Guid DishId { get; set; }
    public string BadgeCode { get; set; } = null!;
    public DishEntity Dish { get; set; } = null!;
    public BadgeEntity Badge { get; set; } = null!;
}

public sealed class PublicationEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public long Version { get; set; }
    public string SnapshotJson { get; set; } = null!;
    public bool IsCurrent { get; set; }
    public DateTimeOffset PublishedAt { get; set; }
    public RestaurantEntity Restaurant { get; set; } = null!;
}
