using Microsoft.EntityFrameworkCore;

namespace OmniRest.Api.Data;

/// <summary>
/// One photo in a restaurant's public gallery. Gallery membership, caption, order, and visibility live
/// here; the image bytes, alt text, and rendered URLs live on the shared Phase 3 media pipeline
/// (<see cref="MediaAssetEntity"/> plus its <see cref="MediaVariantEntity"/> rows).
/// </summary>
public sealed class GalleryImageEntity
{
    public Guid Id { get; set; }
    public Guid RestaurantId { get; set; }
    public Guid MediaAssetId { get; set; }
    public string? Caption { get; set; }

    /// <summary>1-based and contiguous across every row, active or not.</summary>
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long ConcurrencyVersion { get; set; } = 1;
    public RestaurantEntity Restaurant { get; set; } = null!;
    public MediaAssetEntity MediaAsset { get; set; } = null!;
}

public sealed partial class MenuDbContext
{
    private static void ConfigurePhase5(ModelBuilder modelBuilder)
    {
        ConfigureGalleryImages(modelBuilder);
    }

    private static void ConfigureGalleryImages(ModelBuilder modelBuilder)
    {
        var entity = modelBuilder.Entity<GalleryImageEntity>();
        entity.ToTable("restaurant_gallery_images", table =>
        {
            table.HasCheckConstraint("ck_restaurant_gallery_images_display_order", "display_order > 0");
            table.HasCheckConstraint(
                "ck_restaurant_gallery_images_caption",
                "caption IS NULL OR length(btrim(caption)) > 0");
        });
        entity.HasKey(x => x.Id);
        entity.Property(x => x.Id).HasColumnName("id");
        entity.Property(x => x.RestaurantId).HasColumnName("restaurant_id");
        entity.Property(x => x.MediaAssetId).HasColumnName("media_asset_id");
        entity.Property(x => x.Caption).HasColumnName("caption").HasMaxLength(300);
        entity.Property(x => x.DisplayOrder).HasColumnName("display_order");

        // The store default is true, so the sentinel is true as well: an explicit false must reach the
        // database instead of being mistaken for "no value supplied" on insert.
        entity.Property(x => x.IsActive).HasColumnName("is_active").HasDefaultValue(true).HasSentinel(true);
        entity.Property(x => x.CreatedAt).HasColumnName("created_at");
        entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        entity.Property(x => x.ConcurrencyVersion).HasColumnName("concurrency_version")
            .HasDefaultValue(1L).IsConcurrencyToken();

        // Unique display order forces the staged reorder used by categories and dishes.
        entity.HasIndex(x => new { x.RestaurantId, x.DisplayOrder }).IsUnique();
        entity.HasIndex(x => new { x.RestaurantId, x.MediaAssetId }).IsUnique();
        entity.HasIndex(x => new { x.RestaurantId, x.IsActive, x.DisplayOrder });
        entity.HasOne(x => x.Restaurant).WithMany(x => x.GalleryImages)
            .HasForeignKey(x => x.RestaurantId).OnDelete(DeleteBehavior.Cascade);
        entity.HasOne(x => x.MediaAsset).WithMany()
            .HasForeignKey(x => new { x.MediaAssetId, x.RestaurantId })
            .HasPrincipalKey(x => new { x.Id, x.RestaurantId }).OnDelete(DeleteBehavior.Cascade);
    }
}
