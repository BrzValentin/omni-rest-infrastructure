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

/** The published restaurant for the requesting host, or `null` when there is nothing to show. */
export const readRestaurant = cache(async (): Promise<PublicRestaurant | null> => {
  const result = await getPublicRestaurant().catch(() => ({ status: 503, data: null }));
  return result.data;
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
