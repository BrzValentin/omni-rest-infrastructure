import "server-only";

import { cache } from "react";

import type { AdminRestaurant } from "./restaurant-contract";
import { getAdminRestaurant } from "./server-api";

/**
 * Request-scoped reader for the one restaurant this portal instance manages.
 *
 * The owner portal is bound to a single restaurant — the one the request host resolves to and the
 * signed-in owner is a member of — so there is no restaurant id to pass anywhere. Both the protected
 * layout's chrome and its metadata need the name, and these calls use raw `node:http` rather than
 * `fetch`, so `cache()` is what keeps them to one round trip per request.
 *
 * Any failure reads as "not available": the chrome degrades to an unnamed portal, while the layout's
 * own session check remains the thing that decides whether the page renders at all.
 */
export const readAdminRestaurant = cache(async (): Promise<AdminRestaurant | null> => {
  const result = await getAdminRestaurant().catch(() => ({ status: 503, data: null }));
  return result.data;
});
