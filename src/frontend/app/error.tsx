"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import { message } from "@/lib/menu-messages";

/**
 * Root error boundary.
 *
 * `/` now refuses to render anything for a restaurant it could not resolve, so an upstream fault there
 * surfaces as a thrown error rather than as a page carrying a stand-in brand. Without a boundary that
 * would be the framework's bare error page; this gives the same retryable state card `/menu` already
 * has. It carries no header, navigation, or brand mark on purpose: when this renders, the tenant is
 * precisely what could not be established, and it also serves the owner portal.
 */
export default function PageError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const [retrying, startTransition] = useTransition();
  const retryStarted = useRef(false);
  const router = useRouter();

  return (
    <main className="publicMenuMain" id="main-content">
      <section className="publicStateCard" aria-labelledby="page-error-title">
        <h1 id="page-error-title">{message("pageErrorTitle")}</h1>
        <p>{message("errorBody")}</p>
        <button
          className="publicRetryButton"
          disabled={retrying}
          type="button"
          onClick={() => {
            if (!retryStarted.current) {
              retryStarted.current = true;
              startTransition(() => {
                router.refresh();
                reset();
              });
            }
          }}
        >
          {retrying ? message("retrying") : message("retry")}
        </button>
      </section>
    </main>
  );
}
