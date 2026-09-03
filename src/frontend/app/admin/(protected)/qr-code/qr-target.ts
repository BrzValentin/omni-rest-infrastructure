import "server-only";

import { cache } from "react";

import { publicMenuUrl } from "@/lib/public-menu-url";
import { UnsafeHostError } from "@/lib/site-origin";
import { getAdminPublicAddress, UNREACHABLE_API } from "@/lib/server-api";

/**
 * What the QR code should encode, resolved once per request.
 *
 * This module exists because of one fact that is easy to get wrong and expensive to get wrong:
 * **the owner portal is not necessarily served on the restaurant's public host.** Owner endpoints
 * bind the tenant from the signed-in membership, not from `Host` (`Security/OwnerSecurity.cs`), so
 * the portal may run on a separate admin origin — the Playwright fixtures already sign in on
 * `admin.localhost` while the public site is `menu.localhost`. Calling `siteOrigin()` here would
 * therefore encode the *admin* origin into a code a restaurant prints and glues to its tables.
 *
 * So the host comes from the backend, which resolves it from `restaurant_domains` and the tenant
 * slug, and never from this request. The URL is then composed by `lib/public-menu-url.ts`, which
 * reuses the same host and scheme rules as every canonical URL the platform emits.
 */
export type QrTarget =
  /** A public address exists and the code is safe to print. */
  | { readonly kind: "ready"; readonly menuUrl: string; readonly host: string; readonly source: "domain" | "slug" }
  /** The restaurant has no custom domain and the platform has no base domain configured. */
  | { readonly kind: "no-address" }
  /** The caller is not a signed-in owner of this restaurant. */
  | { readonly kind: "unauthorized" }
  /** The backend could not be reached, or answered with a fault. */
  | { readonly kind: "unavailable" };

/**
 * Reads the tenant's public menu URL.
 *
 * `cache()` keeps the page and the two download routes to one backend round trip per request, the
 * same way `lib/admin-data.ts` does for the portal chrome.
 *
 * Authorization is deliberately not re-implemented here. The backend refuses the read with `401` or
 * `403` unless the caller holds an active owner membership, and that refusal is the only check that
 * matters — a second check in the frontend could only ever disagree with it.
 */
export const readQrTarget = cache(async (): Promise<QrTarget> => {
  const result = await getAdminPublicAddress().catch(() => UNREACHABLE_API);
  if (result.status === 401 || result.status === 403) return { kind: "unauthorized" };
  if (!result.data) return { kind: "unavailable" };

  const { host, source } = result.data;
  // `source: "none"` and a null host are the same state, but a backend that reports one without the
  // other must not produce a QR code for the string "null".
  if (!host || source === "none") return { kind: "no-address" };

  try {
    // `restaurant_domains.host` is constrained to carry no port, and in production it needs none.
    // In development and under the Playwright fixtures the public site answers on :3000, so the
    // port has to be reattached from deployment configuration — without it the printed URL would
    // be syntactically perfect and completely unreachable, which is the worst of both.
    const menuUrl = publicMenuUrl(host, { port: process.env.OMNI_REST_PUBLIC_PORT });
    return { kind: "ready", menuUrl, host, source };
  } catch (error) {
    // A stored host that cannot form a safe origin is a data fault, not an outage, but the owner's
    // remedy is the same either way and a half-built URL must never reach a printer.
    if (error instanceof UnsafeHostError) return { kind: "no-address" };
    throw error;
  }
});

