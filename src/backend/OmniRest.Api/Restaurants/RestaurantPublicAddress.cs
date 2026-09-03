namespace OmniRest.Api.Restaurants;

/// <summary>
/// How a restaurant's public address was arrived at. Mirrors the strategies
/// <see cref="Infrastructure.RestaurantResolver"/> uses to go the other way — host to restaurant — so
/// the address handed to the owner dashboard is one the resolver would actually accept back.
/// </summary>
public enum RestaurantPublicAddressSource
{
    /// <summary>No address: the tenant has neither a custom domain nor a platform base domain.</summary>
    None,

    /// <summary>A row in <c>restaurant_domains</c> — a custom domain.</summary>
    Domain,

    /// <summary>The tenant's slug beneath the first configured platform base domain.</summary>
    Slug
}

/// <summary>
/// The host a restaurant's public menu is served on, with the strategy that produced it.
/// <see cref="Host"/> is null exactly when <see cref="Source"/> is
/// <see cref="RestaurantPublicAddressSource.None"/>.
/// </summary>
public readonly record struct RestaurantPublicAddress(string? Host, RestaurantPublicAddressSource Source);

/// <summary>
/// Works out which host the public reaches a restaurant on (PR-26). The owner portal is not necessarily
/// served on the tenant's public host — owner endpoints bind their restaurant from membership
/// (<see cref="Security.OwnerRestaurantContext"/>), not from the request host, and the e2e fixtures run
/// the portal on <c>admin.localhost</c> while the public site is <c>menu.localhost</c>. So the frontend
/// cannot derive a QR target from its own request host and the backend has to say what it is.
///
/// Pure and dependency-free on purpose: the precedence below is a ruling that deserves unit tests of its
/// own, without a database or an HTTP request in the way.
/// </summary>
public static class RestaurantPublicAddresses
{
    /// <summary>
    /// Resolves the public host, trying the same strategies in the same order as
    /// <see cref="Infrastructure.RestaurantResolver.ResolveAsync"/>: a custom domain first, then the slug
    /// beneath a platform base domain. A tenant with neither has no public address, which the dashboard
    /// must report as such rather than printing a QR code that goes nowhere.
    ///
    /// <para>
    /// <c>restaurant_domains</c> carries no primary-domain flag and no ordering column, so a tenant with
    /// several rows needs a deterministic tie-break rather than whatever order the database returns.
    /// The shortest host wins, ties broken by ordinal comparison. Shortest prefers the apex
    /// (<c>prairietable.com</c>) over a <c>www.</c> or regional prefix, which is the name worth printing
    /// on a table tent; ordinal makes the remaining choice stable rather than arbitrary. This is a
    /// deliberate ruling, not an accident of the query — when a tenant wants a different one, the fix is
    /// a primary-domain flag on the table, not a different sort here.
    /// </para>
    /// </summary>
    /// <param name="domainHosts">
    /// The tenant's <c>restaurant_domains.host</c> values. Null and whitespace entries are ignored so a
    /// half-written row cannot become the printed address.
    /// </param>
    /// <param name="slug">The tenant's slug, or null when it has none.</param>
    /// <param name="platformBaseDomains">
    /// <c>PublicMenuOptions.PlatformBaseDomains</c> in configured order — the same list
    /// <see cref="Infrastructure.RestaurantResolver"/> matches against, so the two can never disagree
    /// about which domains carry tenant slugs.
    /// </param>
    public static RestaurantPublicAddress Resolve(
        IEnumerable<string?> domainHosts,
        string? slug,
        IReadOnlyList<string> platformBaseDomains)
    {
        ArgumentNullException.ThrowIfNull(domainHosts);
        ArgumentNullException.ThrowIfNull(platformBaseDomains);

        var domain = domainHosts
            .Where(host => !string.IsNullOrWhiteSpace(host))
            // `TrimEnd('.')` matches RestaurantResolver.TryNormalizeHost exactly. A stored
            // "prairietable.com." is already unreachable — the resolver strips the root dot from the
            // incoming host, so the row can never match — and printing it would put a URL on a table
            // tent that no scan resolves. Normalizing here keeps the printed host one the resolver
            // would accept back.
            .Select(host => host!.Trim().TrimEnd('.').ToLowerInvariant())
            .Where(host => host.Length > 0)
            .OrderBy(host => host.Length)
            .ThenBy(host => host, StringComparer.Ordinal)
            .FirstOrDefault();
        if (domain is not null)
        {
            return new RestaurantPublicAddress(domain, RestaurantPublicAddressSource.Domain);
        }

        var label = slug?.Trim().ToLowerInvariant();

        // Normalized exactly as RestaurantResolver normalizes the same configuration, so a base domain
        // written as ".example.app" produces "menu.example.app" rather than "menu..example.app". An
        // entry that normalizes away entirely is skipped rather than taken literally, because the
        // resolver drops those too and a slug beneath an empty base domain is not a reachable host.
        var baseDomain = platformBaseDomains
            .Select(value => value.Trim().Trim('.').ToLowerInvariant())
            .FirstOrDefault(value => value.Length > 0);

        return string.IsNullOrEmpty(label) || baseDomain is null
            ? new RestaurantPublicAddress(null, RestaurantPublicAddressSource.None)
            : new RestaurantPublicAddress($"{label}.{baseDomain}", RestaurantPublicAddressSource.Slug);
    }

    /// <summary>
    /// The wire form of <paramref name="source"/>. Spelled out rather than derived from the enum name so
    /// renaming the enum cannot silently change a shipped API contract.
    /// </summary>
    public static string ToWireValue(RestaurantPublicAddressSource source) => source switch
    {
        RestaurantPublicAddressSource.Domain => "domain",
        RestaurantPublicAddressSource.Slug => "slug",
        _ => "none"
    };
}
