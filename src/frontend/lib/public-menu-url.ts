import { absoluteUrlFrom, normalizeOriginHost, resolveScheme, UnsafeHostError } from "./site-origin";

/**
 * The URL a QR code points at (PR-26).
 *
 * The target is composed from the **public host the backend reports** for the restaurant, deliberately
 * not from the request host. A QR code outlives the session that produced it: it is printed once and
 * sits on a table for a year. Building it from the admin request's `Host` would bake `admin.example.com`
 * — or a preview deployment, or `localhost` — into a laminated card, and there is no way to recall it.
 *
 * Every rule about what a host may contain lives in `lib/site-origin.ts` and is reused here rather than
 * reimplemented; that module is the single source of truth and is already adversarially tested.
 */

/**
 * The one path a menu QR code ever encodes. Constant by contract: `specifications/architecture.md` §16
 * requires the menu's canonical URL to stay constant across content and publication changes precisely so
 * it can be a QR target without a URL-scheme change.
 */
const menuPath = "/menu";

export type PublicMenuUrlOptions = Readonly<{
  /**
   * Overrides the scheme. Defaults, via `resolveScheme`, to `OMNI_REST_PUBLIC_SCHEME` and then to the
   * loopback heuristic. Read that function's docstring before reaching for `OMNI_REST_FORWARDED_PROTO`
   * instead: it is set to `https` in local development as a deliberate lie, so a code printed in
   * development would encode `https://…:3000` for a site served over plain HTTP.
   */
  scheme?: string;
  /**
   * The port to reattach, and it exists for exactly one reason. In development and in the Playwright
   * fixtures the public site is served on `:3000`, but the backend's `restaurant_domains.host` column is
   * constrained to hold no port (`host !~ '[:/\s]'`), so the host it reports can never carry one. The
   * port therefore has to come back from deployment configuration. In production the site is on 443 and
   * this is absent.
   */
  port?: string;
}>;

/**
 * Builds the absolute, parameter-free menu URL for a restaurant's public host.
 *
 * Throws `UnsafeHostError` — the existing type, so callers keep one failure mode for unusable hosts —
 * rather than emitting a URL that would print onto something physical.
 */
export function publicMenuUrl(publicHost: string, options: PublicMenuUrlOptions = {}): string {
  const host = normalizeOriginHost(publicHost);
  if (hostCarriesPort(host)) {
    // Accepting a port here would give the deployment two disagreeing sources for it: the backend's
    // column cannot hold one, so a port arriving in this argument means something upstream is guessing.
    throw new UnsafeHostError("the public host carries a port, which must come from options.port");
  }

  const scheme = resolveScheme(host, options.scheme);
  const port = normalizePort(options.port, scheme);
  const origin = `${scheme}://${port === null ? host : `${host}:${port}`}`;

  // `absoluteUrlFrom` drops any query string or fragment. Nothing this platform emits carries tracking
  // parameters (`specifications/phase-6/README.md` ruling 10), and a QR code is the worst possible place
  // to start: a `?src=qr` printed on a card is permanent, unremovable, and splits the canonical URL.
  return absoluteUrlFrom(origin, menuPath);
}

/** True when a normalized host ends in `:port`. Written to leave a bracketed IPv6 literal alone. */
function hostCarriesPort(host: string): boolean {
  return /:\d+$/.test(host);
}

/**
 * Validates the configured port and returns it, or `null` when the origin should carry none.
 *
 * A port that is the scheme's default is dropped: `https://menu.example.com:443` is a different string
 * from the canonical origin the rest of the platform emits, and a QR code that encodes the non-canonical
 * spelling sends every scan through a redirect it does not need.
 */
function normalizePort(port: string | undefined, scheme: "http" | "https"): string | null {
  if (port === undefined) return null;
  if (!/^[1-9][0-9]{0,4}$/.test(port)) {
    throw new UnsafeHostError(`the configured port ${JSON.stringify(port)} is not a number`);
  }
  const value = Number(port);
  if (value > 65535) throw new UnsafeHostError(`the configured port ${port} is out of range`);
  if ((scheme === "http" && value === 80) || (scheme === "https" && value === 443)) return null;
  return port;
}
