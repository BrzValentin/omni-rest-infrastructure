import type { MetadataRoute } from "next";

import { getPublicMenu, PublicMenuApiError } from "@/lib/menu-api";
import { siteOrigin } from "@/lib/seo";

/**
 * Per-host `sitemap.xml` (PR-17 Task 3).
 *
 * Contains exactly the indexable routes from `specifications/phase-6/page-indexing-classification.md`
 * section 2 and nothing else. Every entry is derived from the **published** projection, so a category
 * that has not been published — or has been unpublished — leaves the sitemap on the next request
 * without any explicit invalidation step. That is what satisfies PR-17 Task 3's "automatically update
 * when a restaurant is created / updated / a dish is published / a URL changes": the document is
 * regenerated per request from the same snapshot the pages render from, so it cannot go stale.
 *
 * `lastmod` is the publication timestamp, not the request time. A request-time `lastmod` would tell
 * crawlers the whole site changed on every fetch, which trains them to ignore the signal.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();

  let site;
  try {
    site = await getPublicMenu();
  } catch (error) {
    // An unknown host has no published content to advertise. Returning an empty sitemap is correct and
    // is preferable to a 500, which a crawler would retry.
    if (error instanceof PublicMenuApiError) return [];
    throw error;
  }

  const lastModified = site.restaurant?.publishedAt ?? site.publishedAt ?? undefined;
  // `/` and `/menu` always exist and always return 200 — `/menu` renders a "menu coming soon" state
  // rather than a 404 when nothing is published — so both are listed unconditionally, matching their
  // classification. Category URLs exist only while their category is published.
  const entries: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/menu`, lastModified, changeFrequency: "weekly", priority: 0.9 },
  ];

  for (const category of site.menu?.categories ?? []) {
    entries.push({
      url: `${origin}/menu/${encodeURIComponent(category.slug)}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  return entries;
}
