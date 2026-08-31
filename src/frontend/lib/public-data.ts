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
 * A `PublicMenuApiError` means "this host has nothing published", which every caller treats as an
 * absence rather than a failure. Any other error is a real fault and propagates.
 */
export const readSite = cache(async (): Promise<PublicMenuResponse | null> => {
  try {
    return await getPublicMenu();
  } catch (error) {
    if (error instanceof PublicMenuApiError) return null;
    throw error;
  }
});
