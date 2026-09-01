/**
 * Tenant host resolution.
 *
 * The backend resolves the restaurant from the `Host` header of every request, so the frontend's only
 * job is to forward that header faithfully. Substituting a default when the header is missing or
 * malformed makes the platform fail *open*: an unknown host would silently be served one specific
 * tenant's data, which is exactly the cross-restaurant leakage PR-20 Tasks 6-9 forbid.
 *
 * This module therefore has one rule — an unusable `Host` resolves to nothing, never to a fallback.
 * Callers turn that into a `404`, matching PR-20 Task 2 ("Return HTTP 404 if the restaurant cannot be
 * resolved").
 *
 * The port is stripped: the backend resolves tenants by hostname alone. `lib/site-origin.ts` keeps the
 * port instead, because an origin without one is not addressable in local development; the two modules
 * answer different questions and deliberately stay separate.
 *
 * Like `lib/site-origin.ts`, this file carries neither `server-only` nor `next/headers` so the rules
 * can be unit tested directly.
 */
export class UnresolvableTenantHostError extends Error {
  constructor(reason: string) {
    super(`Refusing to resolve a tenant: ${reason}.`);
    this.name = "UnresolvableTenantHostError";
  }
}

/** Validates a raw `Host` header and returns the lower-cased hostname. Throws when it is unusable. */
export function tenantHost(rawHost: string | null | undefined): string {
  if (!rawHost) throw new UnresolvableTenantHostError("the request carried no Host header");
  if (rawHost.length > 259) throw new UnresolvableTenantHostError("the Host header is too long");
  if (/[\s,\/]/.test(rawHost)) {
    throw new UnresolvableTenantHostError("the Host header contains illegal characters");
  }

  let parsed: URL;
  try {
    parsed = new URL(`http://${rawHost}`);
  } catch {
    throw new UnresolvableTenantHostError("the Host header is not a valid authority");
  }
  if (parsed.username || parsed.password) {
    throw new UnresolvableTenantHostError("the Host header carries credentials");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new UnresolvableTenantHostError("the Host header carries a path, query, or fragment");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname.length === 0) throw new UnresolvableTenantHostError("the Host header has an empty hostname");
  return hostname;
}

/** The same rules for callers that answer with a status code rather than an exception. */
export function tenantHostOrNull(rawHost: string | null | undefined): string | null {
  try {
    return tenantHost(rawHost);
  } catch {
    return null;
  }
}
