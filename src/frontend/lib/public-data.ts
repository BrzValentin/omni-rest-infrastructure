import "server-only";

import { cache } from "react";

import { getPublicMenu, PublicMenuApiError } from "./menu-api";
import type { PublicMenuResponse } from "./menu-contract";
import type { PublicRestaurant } from "./restaurant-contract";
import { getPublicRestaurant } from "./server-api";

/**
 * Request-scoped readers for the published projection.
 *
 * Phase 6 makes every public route read the same data twice — once in `generateMetadata` for the
 * title, description, and canonical, and once in the page body for the markup and JSON-LD. These
 * calls use raw `node:http` rather than `fetch`, so Next.js's fetch deduplication does not apply.
 * `cache()` memoizes per request instead, keeping the page at one round trip per endpoint no matter
 * how many callers ask for it.
 */

/** Raised when the restaurant endpoint fails for a reason other than "this host has no restaurant". */
export class PublicRestaurantApiError extends Error {
  constructor(public readonly status: number) {
    super("Public restaurant request failed.");
    this.name = "PublicRestaurantApiError";
  }
}

/**
 * The published restaurant for the requesting host, or `null` when the host resolves to none.
 *
 * The `null`/throw split matters as much here as it does in `readSite`. `null` means the host is not a
 * published restaurant, and the caller answers `404`. Every other failure — an unreachable API, a
 * `503` — throws, so the caller renders its error boundary. Collapsing the two would either tell a
 * crawler a live tenant is permanently gone or, worse, keep rendering a page for a restaurant that was
 * never resolved, which on a multi-tenant platform means rendering someone else's branding.
 */
export const readRestaurant = cache(async (): Promise<PublicRestaurant | null> => {
  const result = await getPublicRestaurant().catch(() => ({ status: 503, data: null }));
  if (result.data) return result.data;
  if (result.status === 404) return null;
  throw new PublicRestaurantApiError(result.status);
});

/**
 * The published menu payload, or `null` when the host resolves to no published site.
 *
 * Only a `404` counts as an absence. Every other upstream status is a real failure and propagates so
 * the route renders its error boundary and responds `503`. Collapsing a transient upstream fault into
 * a `404` would be worse than an outage: it tells a crawler the page is gone, which is exactly the
 * signal `specifications/phase-6/page-indexing-classification.md` section 5 forbids.
 */
export const readSite = cache(async (): Promise<PublicMenuResponse | null> => {
  try {
    return await getPublicMenu();
  } catch (error) {
    if (error instanceof PublicMenuApiError && error.status === 404) return null;
    throw error;
  }
});

/**
 * The published menu payload for callers that only want it as a hint, degrading to `null` on any
 * upstream failure.
 *
 * The home page uses this to decide whether to emit `hasMenu` in its structured data. That page is
 * driven by the restaurant endpoint, so a menu-endpoint fault should cost one optional schema
 * property, not the whole page.
 */
export const readSiteForSchema = cache(async (): Promise<PublicMenuResponse | null> => {
  try {
    return await readSite();
  } catch (error) {
    if (error instanceof PublicMenuApiError) return null;
    throw error;
  }
});
