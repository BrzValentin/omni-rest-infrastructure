import type { Metadata } from "next";

import { PublicShell } from "@/components/PublicShell";
import { StateCard } from "@/components/state/StateCard";
import { message } from "@/lib/menu-messages";
import { nonIndexableMetadata } from "@/lib/seo";

/**
 * Root not-found page. Serves every unmatched URL, and is served with a real `404` status.
 *
 * No canonical is emitted and the page is `noindex` (PR-17 Task 4): a 404 must never be captured as
 * content, and pointing a canonical at it would be worse than emitting nothing.
 *
 * The copy is its own. This page used to borrow the "no public restaurant for this address" body,
 * which told a visitor who mistyped one path on a perfectly healthy restaurant that the restaurant
 * itself did not exist. That sentence now belongs only to `/menu`, where the address genuinely does
 * resolve to no tenant. There is no retry here: a wrong address does not become right on a second try.
 */
export const metadata: Metadata = nonIndexableMetadata({ title: "Page not found" });

export default function NotFound() {
  return (
    <PublicShell>
      <main className="publicMenuMain" id="main-content">
        <StateCard variant="notFound" title={message("notFoundTitle")} body={message("notFoundBody")} />
      </main>
    </PublicShell>
  );
}
