using System.Globalization;
using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OmniRest.Api.Data;
using OmniRest.Api.Menus;

namespace OmniRest.Api.Infrastructure;

public sealed record RestaurantResolution(Guid Id, string Name, string Locale, string Currency, string TaxDisplayMode, string? TaxNoticeKey);

public interface IRestaurantResolver
{
    Task<RestaurantResolution?> ResolveAsync(HostString requestHost, CancellationToken cancellationToken);
}

public sealed class RestaurantResolver(
    MenuDbContext dbContext,
    IHostEnvironment environment,
    IOptions<PublicMenuOptions> options) : IRestaurantResolver
{
    public async Task<RestaurantResolution?> ResolveAsync(HostString requestHost, CancellationToken cancellationToken)
    {
        if (!TryNormalizeHost(requestHost, out var host))
        {
            return null;
        }

        var resolved = await dbContext.RestaurantDomains.AsNoTracking()
            .Where(domain => domain.Host == host)
            .Select(domain => new RestaurantResolution(
                domain.Restaurant.Id,
                domain.Restaurant.Name,
                domain.Restaurant.Settings.Locale,
                domain.Restaurant.Settings.Currency,
                domain.Restaurant.Settings.TaxDisplayMode,
                domain.Restaurant.Settings.TaxNoticeKey))
            .SingleOrDefaultAsync(cancellationToken);

        if (resolved is not null || !environment.IsDevelopment() || !IsLoopback(host) ||
            options.Value.DevelopmentDefaultRestaurantId is not Guid defaultId)
        {
            return resolved;
        }

        return await dbContext.Restaurants.AsNoTracking()
            .Where(restaurant => restaurant.Id == defaultId)
            .Select(restaurant => new RestaurantResolution(
                restaurant.Id,
                restaurant.Name,
                restaurant.Settings.Locale,
                restaurant.Settings.Currency,
                restaurant.Settings.TaxDisplayMode,
                restaurant.Settings.TaxNoticeKey))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public static bool TryNormalizeHost(HostString requestHost, out string host)
    {
        host = string.Empty;
        try
        {
            if (requestHost.Value?.Contains("://", StringComparison.Ordinal) == true)
            {
                return false;
            }

            var candidate = requestHost.Host.Trim().TrimEnd('.');
            if (candidate.Length is 0 or > 253 || candidate.Contains('/') || candidate.Contains('\\') ||
                candidate.Contains(',') || candidate.Any(char.IsWhiteSpace))
            {
                return false;
            }

            if (IPAddress.TryParse(candidate, out var address))
            {
                host = address.ToString().ToLowerInvariant();
                return true;
            }

            var idn = new IdnMapping().GetAscii(candidate).ToLowerInvariant();
            if (Uri.CheckHostName(idn) != UriHostNameType.Dns ||
                idn.Split('.').Any(label => label.Length is 0 or > 63 || label.StartsWith('-') || label.EndsWith('-')))
            {
                return false;
            }

            host = idn;
            return true;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    private static bool IsLoopback(string host) =>
        host == "localhost" || (IPAddress.TryParse(host, out var address) && IPAddress.IsLoopback(address));
}
