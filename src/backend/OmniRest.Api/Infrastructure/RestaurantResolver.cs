using System.Globalization;
using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OmniRest.Api.Data;
using OmniRest.Api.Menus;

namespace OmniRest.Api.Infrastructure;

/// <summary>
/// How a request's restaurant was identified. Recorded so security logging can say which strategy
/// admitted a request, and so tests can prove a strategy is actually exercised.
/// </summary>
public enum RestaurantResolutionSource
{
    /// <summary>An exact <c>restaurant_domains.host</c> match — a custom domain.</summary>
    Domain,

    /// <summary>A slug label beneath one of the configured platform base domains.</summary>
    Subdomain,

    /// <summary>A configured fallback restaurant, used for loopback development hosts.</summary>
    Configuration
}

public sealed record RestaurantResolution(
    Guid Id,
    string Name,
    string Locale,
    string Currency,
    string TaxDisplayMode,
    string? TaxNoticeKey,
    RestaurantResolutionSource Source = RestaurantResolutionSource.Domain);

public interface IRestaurantResolver
{
    Task<RestaurantResolution?> ResolveAsync(HostString requestHost, CancellationToken cancellationToken);
}

/// <summary>
/// Resolves the restaurant serving a request from its host, trying each configured strategy in
/// priority order: an exact custom domain, then a slug beneath a platform base domain, then the
/// configured development fallback (PR-20 Task 2). An unresolved host yields <c>null</c>, which every
/// public endpoint turns into a 404.
/// </summary>
public sealed class RestaurantResolver(
    MenuDbContext dbContext,
    IHostEnvironment environment,
    IOptions<PublicMenuOptions> options) : IRestaurantResolver
{
    // Configuration is free-form text; the host it is compared against is already lowercase ASCII.
    private readonly string[] platformBaseDomains = [.. options.Value.PlatformBaseDomains
        .Select(value => value.Trim().Trim('.').ToLowerInvariant())
        .Where(value => value.Length > 0)];

    public async Task<RestaurantResolution?> ResolveAsync(HostString requestHost, CancellationToken cancellationToken)
    {
        if (!TryNormalizeHost(requestHost, out var host))
        {
            return null;
        }

        return await ResolveByDomainAsync(host, cancellationToken)
            ?? await ResolveBySubdomainAsync(host, cancellationToken)
            ?? await ResolveByConfigurationAsync(host, cancellationToken);
    }

    /// <summary>Strategy 1 — an exact custom-domain match.</summary>
    private Task<RestaurantResolution?> ResolveByDomainAsync(string host, CancellationToken cancellationToken) =>
        dbContext.RestaurantDomains.AsNoTracking()
            .Where(domain => domain.Host == host)
            .Select(domain => new RestaurantResolution(
                domain.Restaurant.Id,
                domain.Restaurant.Name,
                domain.Restaurant.Settings.Locale,
                domain.Restaurant.Settings.Currency,
                domain.Restaurant.Settings.TaxDisplayMode,
                domain.Restaurant.Settings.TaxNoticeKey,
                RestaurantResolutionSource.Domain))
            .SingleOrDefaultAsync(cancellationToken)!;

    /// <summary>
    /// Strategy 2 — a single slug label beneath a configured platform base domain, so
    /// <c>prairie-table.example.app</c> finds the restaurant whose slug is <c>prairie-table</c>.
    /// Only the immediate label is considered: a deeper host like <c>a.b.example.app</c> is not a
    /// tenant, and treating it as one would let a wildcard certificate holder invent tenants.
    /// </summary>
    private async Task<RestaurantResolution?> ResolveBySubdomainAsync(string host, CancellationToken cancellationToken)
    {
        if (!TryExtractSlug(host, platformBaseDomains, out var slug))
        {
            return null;
        }

        return await dbContext.Restaurants.AsNoTracking()
            .Where(restaurant => restaurant.Slug == slug)
            .Select(restaurant => new RestaurantResolution(
                restaurant.Id,
                restaurant.Name,
                restaurant.Settings.Locale,
                restaurant.Settings.Currency,
                restaurant.Settings.TaxDisplayMode,
                restaurant.Settings.TaxNoticeKey,
                RestaurantResolutionSource.Subdomain))
            .SingleOrDefaultAsync(cancellationToken);
    }

    /// <summary>
    /// Strategy 3 — the configured fallback. This stays restricted to Development on a loopback host so
    /// a misconfigured production deployment can never quietly serve one tenant for every unknown name.
    /// </summary>
    private async Task<RestaurantResolution?> ResolveByConfigurationAsync(string host, CancellationToken cancellationToken)
    {
        if (!environment.IsDevelopment() || !IsLoopback(host) ||
            options.Value.DevelopmentDefaultRestaurantId is not Guid defaultId)
        {
            return null;
        }

        return await dbContext.Restaurants.AsNoTracking()
            .Where(restaurant => restaurant.Id == defaultId)
            .Select(restaurant => new RestaurantResolution(
                restaurant.Id,
                restaurant.Name,
                restaurant.Settings.Locale,
                restaurant.Settings.Currency,
                restaurant.Settings.TaxDisplayMode,
                restaurant.Settings.TaxNoticeKey,
                RestaurantResolutionSource.Configuration))
            .SingleOrDefaultAsync(cancellationToken);
    }

    /// <summary>
    /// Returns the single label a normalized host carries beneath one of <paramref name="baseDomains"/>,
    /// when that label is a well-formed slug. Both inputs are already lowercase ASCII.
    /// </summary>
    internal static bool TryExtractSlug(string host, IReadOnlyCollection<string> baseDomains, out string slug)
    {
        slug = string.Empty;
        foreach (var baseDomain in baseDomains)
        {
            if (baseDomain.Length == 0 || host.Length <= baseDomain.Length + 1 ||
                !host.EndsWith(baseDomain, StringComparison.Ordinal) ||
                host[host.Length - baseDomain.Length - 1] != '.')
            {
                continue;
            }

            var label = host[..(host.Length - baseDomain.Length - 1)];
            if (label.Contains('.') || !RestaurantSlugs.IsValid(label))
            {
                continue;
            }

            slug = label;
            return true;
        }

        return false;
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
