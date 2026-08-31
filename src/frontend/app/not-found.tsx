import type { Metadata } from "next";

import { PublicShell } from "@/components/PublicShell";
import { message } from "@/lib/menu-messages";
import { nonIndexableMetadata } from "@/lib/seo";

/**
 * Root not-found page. Serves every unmatched URL, and is served with a real `404` status.
 *
 * No canonical is emitted and the page is `noindex` (PR-17 Task 4): a 404 must never be captured as
 * content, and pointing a canonical at it would be worse than emitting nothing.
 */
export const metadata: Metadata = nonIndexableMetadata({ title: "Page not found" });

export default function NotFound() {
  return (
    <PublicShell>
      <main className="publicMenuMain" id="main-content">
        <section className="publicStateCard">
          <h1>Page not found</h1>
          <p>{message("unknownRestaurantBody")}</p>
        </section>
      </main>
    </PublicShell>
  );
}
