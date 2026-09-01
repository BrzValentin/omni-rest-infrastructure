import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import { readSite } from "./public-data";

/**
 * Document-level identity for the requesting tenant: the language of `<html lang>` and the fallback
 * `<title>`.
 *
 * `<html lang>` used to be a hardcoded `en-CA` even though every restaurant carries its own `locale`
 * — the seeded platform already has a `fr-CA` tenant. Only the root layout can set that attribute, so
 * the value has to be resolved here rather than in a page.
 *
 * The owner portal deliberately does *not* follow the tenant locale. `lang` declares the language of
 * the text in the document, and every string in the portal chrome (and in `lib/menu-messages.ts`) is
 * English; announcing a French restaurant's `fr-CA` over an English portal would tell a screen reader
 * to pronounce English words with French phonetics. The tenant's locale governs the tenant's public
 * pages, which is where the restaurant's own content is. The portal is identified by a request header
 * set in `proxy.ts`, which also keeps admin routes from making a public read they have no use for.
 *
 * Nothing here may throw: an exception in the root layout escapes every error boundary below it. An
 * unresolved tenant falls back to the language this application's own copy is written in.
 */
export const defaultDocumentLocale = "en-CA";

export type TenantDocument = Readonly<{ lang: string; name: string | null }>;

export const readTenantDocument = cache(async (): Promise<TenantDocument> => {
  const requestHeaders = await headers();
  if (requestHeaders.get("x-omni-admin-surface") === "1") {
    return { lang: defaultDocumentLocale, name: null };
  }
  try {
    const site = await readSite();
    return site
      ? { lang: site.locale, name: site.restaurantName }
      : { lang: defaultDocumentLocale, name: null };
  } catch {
    return { lang: defaultDocumentLocale, name: null };
  }
});
