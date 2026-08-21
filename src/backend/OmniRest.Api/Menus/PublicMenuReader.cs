using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using OmniRest.Api.Data;
using OmniRest.Api.Infrastructure;
using OmniRest.Api.Restaurants;

namespace OmniRest.Api.Menus;

public sealed record PublicMenuReadResult(PublicMenuResponse Response, string ETag);

public interface IPublicMenuReader
{
    Task<PublicMenuReadResult?> ReadAsync(HostString host, CancellationToken cancellationToken);
}

public sealed class PublicMenuReader(
    IRestaurantResolver resolver,
    MenuDbContext dbContext,
    IMemoryCache cache,
    PublicMenuSnapshotSerializer serializer,
    ILogger<PublicMenuReader>? suppliedLogger = null) : IPublicMenuReader
{
    private readonly ILogger<PublicMenuReader> logger = suppliedLogger ??
        Microsoft.Extensions.Logging.Abstractions.NullLogger<PublicMenuReader>.Instance;

    public async Task<PublicMenuReadResult?> ReadAsync(HostString host, CancellationToken cancellationToken)
    {
        var restaurant = await resolver.ResolveAsync(host, cancellationToken);
        if (restaurant is null)
        {
            return null;
        }

        var publication = await dbContext.Publications.AsNoTracking()
            .Where(item => item.RestaurantId == restaurant.Id && item.IsCurrent)
            .Select(item => new { item.Version, item.SnapshotJson })
            .SingleOrDefaultAsync(cancellationToken);

        if (publication is null)
        {
            var empty = new PublicMenuResponse(
                restaurant.Id.ToString("D"), restaurant.Name, restaurant.Locale, restaurant.Currency,
                restaurant.TaxDisplayMode, restaurant.TaxNoticeKey, "0", null,
                WebsiteDesignId: WebsiteDesignIds.LegacyCurrent);
            return new PublicMenuReadResult(empty, CreateETag(restaurant.Id, 0));
        }

        var key = $"public-menu:{restaurant.Id:N}:{publication.Version}";
        if (!cache.TryGetValue(key, out PublicMenuResponse? response) || response is null)
        {
            response = serializer.Deserialize(publication.SnapshotJson);
            if (response.RestaurantId != restaurant.Id.ToString("D") ||
                response.PublicationVersion != publication.Version.ToString(System.Globalization.CultureInfo.InvariantCulture))
            {
                throw new InvalidOperationException("Publication snapshot identity does not match its database row.");
            }

            var resolvedDesignId = WebsiteDesignCatalog.ResolvePublished(response.WebsiteDesignId);
            if (!string.Equals(response.WebsiteDesignId, resolvedDesignId, StringComparison.Ordinal))
            {
                logger.LogWarning(
                    "Publication {PublicationVersion} for restaurant {RestaurantId} uses a missing or unsupported website design; the legacy renderer was selected.",
                    publication.Version,
                    restaurant.Id);
            }
            response = response with
            {
                WebsiteDesignId = resolvedDesignId,
                Restaurant = response.Restaurant is null
                    ? null
                    : response.Restaurant with { WebsiteDesignId = resolvedDesignId }
            };

            cache.Set(key, response, new MemoryCacheEntryOptions
            {
                Size = 1,
                SlidingExpiration = TimeSpan.FromMinutes(10)
            });
        }

        return new PublicMenuReadResult(response, CreateETag(restaurant.Id, publication.Version));
    }

    public static string CreateETag(Guid restaurantId, long version) => $"\"{restaurantId:N}-{version}\"";
}
