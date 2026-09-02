"use client";

import { useRouter } from "next/navigation";

import { StateCard, useReportedDigest } from "@/components/state/StateCard";
import { message } from "@/lib/menu-messages";

/**
 * Root error boundary.
 *
 * `/` now refuses to render anything for a restaurant it could not resolve, so an upstream fault there
 * surfaces as a thrown error rather than as a page carrying a stand-in brand. Without a boundary that
 * would be the framework's bare error page; this gives the same retryable state card `/menu` already
 * has. It carries no header, navigation, or brand mark on purpose: when this renders, the tenant is
 * precisely what could not be established, and it also serves the owner portal. That rules out
 * `PublicShell` — its chrome resolves a restaurant this render has no restaurant to resolve.
 *
 * What it does carry is one deliberately unbranded `/` link, so the reader is never stranded on a
 * page whose only control is a retry that may keep failing. The link names no restaurant and no
 * platform, and the boundary's own digest is logged rather than shown (see `useReportedDigest`):
 * nothing internal is ever rendered here.
 */
export default function PageError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const router = useRouter();
  useReportedDigest(error);

  return (
    <main className="publicMenuMain" id="main-content">
      <StateCard
        variant="error"
        titleId="page-error-title"
        title={message("pageErrorTitle")}
        body={message("errorBody")}
        onRetry={() => {
          router.refresh();
          reset();
        }}
      />
      <p>
        {/* A plain anchor, not `next/link`, on purpose: a full document load is the point here. A
            client-side navigation would reuse the very router and layout state that produced this
            boundary, so the reader could land on the same broken tree they were trying to leave. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/">{message("backToHome")}</a>
      </p>
    </main>
  );
}
