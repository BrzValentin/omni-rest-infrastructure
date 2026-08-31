import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/seo";

/**
 * Per-host `robots.txt` (PR-17 Task 2).
 *
 * Restaurants are resolved from the request host and the application has no build-time knowledge of
 * which hosts exist, so this must be generated per request — the `Sitemap:` line has to name the
 * requesting tenant. Reading the host through `headers()` already opts the route out of caching;
 * `force-dynamic` states the same intent explicitly so an unrelated refactor cannot silently make it
 * static and freeze one tenant's hostname into every other tenant's `robots.txt`.
 *
 * The disallow list is derived from `specifications/phase-6/page-indexing-classification.md` and must
 * not drift from it. `/dashboard`, `/login`, and `/register` are named by PR-17 Task 2 but do not
 * exist here (the owner portal is `/admin`); they are kept as defensive entries so a future route
 * reusing those names is blocked from the moment it ships.
 *
 * `/media` is deliberately *not* disallowed: it serves the images the public pages embed, and blocking
 * it would remove the restaurant's photos from image search and break any consumer that verifies the
 * `image` URLs in the Schema.org output.
 */
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api", "/dashboard", "/login", "/register"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
