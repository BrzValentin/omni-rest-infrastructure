/**
 * Resolves the absolute public origin of the requesting tenant.
 *
 * Every restaurant is served on its own host, so canonical URLs, sitemap entries, and Schema.org `url`
 * values can only be derived from the incoming request. A `Host` header is client-controlled, so this
 * module never trusts it on its own:
 *
 *  - the syntax is validated here and anything malformed is rejected outright;
 *  - the scheme comes from deployment-owned configuration, never from a client `X-Forwarded-Proto`
 *    (the same rule `app/api/v1/[...path]/route.ts` already applies when forwarding to the API);
 *  - callers only reach this module after the backend has already resolved the host to a *published*
 *    restaurant, so an attacker-supplied host has produced a `404` long before a canonical tag exists.
 *
 * Unlike `normalizePublicHost` in `lib/menu-api.ts` — which strips the port because the backend resolves
 * tenants by hostname alone — this keeps the port, because an origin without it is not addressable in
 * local development (`http://menu.localhost:3000`).
 *
 * This module is deliberately free of `server-only` and `next/headers` so the parsing rules can be unit
 * tested. The request-bound wrappers live in `lib/seo.ts`.
 */
export class UnsafeHostError extends Error {
  constructor(reason: string) {
    super(`Refusing to build a public origin: ${reason}.`);
    this.name = "UnsafeHostError";
  }
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Validates a raw `Host` header and returns it normalized, port included. */
export function normalizeOriginHost(rawHost: string | null | undefined): string {
  if (!rawHost) throw new UnsafeHostError("the request carried no Host header");
  if (rawHost.length > 259) throw new UnsafeHostError("the Host header is too long");
  if (/[\s,\\/]/.test(rawHost)) throw new UnsafeHostError("the Host header contains illegal characters");

  let parsed: URL;
  try {
    parsed = new URL(`http://${rawHost}`);
  } catch {
    throw new UnsafeHostError("the Host header is not a valid authority");
  }
  if (parsed.username || parsed.password) throw new UnsafeHostError("the Host header carries credentials");
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new UnsafeHostError("the Host header carries a path, query, or fragment");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname.length === 0) throw new UnsafeHostError("the Host header has an empty hostname");
  return parsed.port ? `${hostname}:${parsed.port}` : hostname;
}

/**
 * Chooses the public scheme. Explicit deployment configuration always wins; otherwise loopback-family
 * hosts fall back to `http` so local development produces addressable URLs, and everything else to
 * `https`, which is the only scheme a production tenant is served on.
 *
 * This reads `OMNI_REST_PUBLIC_SCHEME`, deliberately **not** `OMNI_REST_FORWARDED_PROTO`. The two look
 * interchangeable and are not: `OMNI_REST_FORWARDED_PROTO` is set to `https` in local development
 * precisely as a lie, so the API believes the request arrived over TLS and will issue its `Secure`
 * auth cookies over plain HTTP. Deriving canonical URLs from it would make every local canonical and
 * sitemap entry claim `https://…:3000` for a site actually served over `http`.
 */
export function resolveScheme(host: string, configured = process.env.OMNI_REST_PUBLIC_SCHEME): "http" | "https" {
  if (configured === "http" || configured === "https") return configured;
  const hostname = host.split(":", 1)[0];
  return loopbackHosts.has(hostname) || hostname.endsWith(".localhost") ? "http" : "https";
}

/** Builds the origin for a raw `Host` header value. Never ends with a slash. */
export function buildOrigin(rawHost: string | null | undefined): string {
  const host = normalizeOriginHost(rawHost);
  return `${resolveScheme(host)}://${host}`;
}

/**
 * Joins a root-relative path onto a tenant origin. Query strings and fragments are dropped: every
 * canonical URL, sitemap entry, and Schema.org URL this platform emits is parameter-free by contract
 * (`specifications/phase-6/README.md` ruling 10).
 */
export function absoluteUrlFrom(origin: string, path: string): string {
  if (!path.startsWith("/")) throw new UnsafeHostError("only root-relative paths can be made absolute");
  if (path.startsWith("//")) throw new UnsafeHostError("a protocol-relative path is not a tenant path");
  const url = new URL(path, `${origin}/`);
  if (url.origin !== origin) throw new UnsafeHostError("the path escaped the tenant origin");
  return `${origin}${url.pathname}`;
}
