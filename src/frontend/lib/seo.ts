import "server-only";

import type { Metadata } from "next";
import { headers } from "next/headers";

import { absoluteUrlFrom, buildOrigin } from "./site-origin";

/**
 * Request-bound SEO helpers.
 *
 * `metadataBase` is deliberately never configured. Every restaurant is served on its own host, so any
 * build-time base would be wrong for every tenant; Next.js ignores `metadataBase` whenever a metadata
 * field supplies an absolute URL, so emitting absolute URLs here is both correct and sufficient. The
 * consequence is a rule rather than a preference: *every* URL-valued metadata field this application
 * sets must be absolute, because a relative one without `metadataBase` fails the build.
 */

/** The requesting tenant's absolute origin, with no trailing slash. */
export async function siteOrigin(): Promise<string> {
  return buildOrigin((await headers()).get("host"));
}

/** The absolute, parameter-free URL for a root-relative path on the requesting tenant. */
export async function absoluteUrl(path: string): Promise<string> {
  return absoluteUrlFrom(await siteOrigin(), path);
}

/**
 * Metadata for a public, indexable page: a self-referencing absolute canonical plus `index, follow`.
 *
 * `robots` is written out in full at every call site rather than inherited from the root layout,
 * because Next.js merges metadata shallowly — a nested object such as `robots` defined in a later
 * segment replaces the earlier one outright instead of merging into it.
 */
export async function publicPageMetadata(
  path: string,
  metadata: Omit<Metadata, "alternates" | "robots">,
): Promise<Metadata> {
  return {
    ...metadata,
    alternates: { canonical: await absoluteUrl(path) },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
  };
}

/**
 * Metadata for a page that must never be indexed: admin surfaces, previews, errors, and `404`s.
 *
 * No canonical is emitted. A canonical on a non-indexable page is at best ignored and at worst an
 * instruction to consolidate signals onto a page that must not rank at all.
 */
export function nonIndexableMetadata(metadata: Omit<Metadata, "alternates" | "robots"> = {}): Metadata {
  return {
    ...metadata,
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  };
}
