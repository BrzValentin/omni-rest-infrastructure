"use client";

import { useEffect, useId, useRef, useTransition, type ReactNode } from "react";

import { message } from "@/lib/menu-messages";

/**
 * What the reader is being told, which is not the same question as what the server returned.
 *
 * - `notFound` — the address is wrong; retrying it will not help.
 * - `error` — something failed while loading; retrying may well help.
 * - `unavailable` — a dependency is down; retrying later will help.
 * - `empty` — the request succeeded and there is genuinely nothing to show.
 */
export type StateVariant = "notFound" | "error" | "unavailable" | "empty";

/**
 * Records a boundary's `digest` in the browser console, once per mount.
 *
 * Without it a user report ("the page said it could not load") had nothing in it that could be found
 * in a server log. The digest is exactly that link, and it is safe to surface because it identifies
 * the log entry rather than describing the fault. The error's own message is neither logged nor
 * rendered: in production Next.js redacts it, and where it is not redacted it can carry internal
 * detail that belongs in no user's browser.
 */
export function useReportedDigest(error: Readonly<{ name?: string; digest?: string }>): void {
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    console.error("[route-boundary]", JSON.stringify({
      at: new Date().toISOString(),
      path: typeof window === "undefined" ? null : window.location.pathname,
      digest: error.digest ?? null,
      type: error.name ?? "Error",
    }));
  }, [error]);
}

type StateCardProps = Readonly<{
  variant: StateVariant;
  title: string;
  body: string;
  /** Supply when something outside the card must reference the heading, or for a stable test hook. */
  titleId?: string;
  /** `2` when the card sits below a page heading that already owns the `h1`. */
  headingLevel?: 1 | 2;
  /**
   * Runs at most once per mount, inside a transition. Omit for a state where retrying is pointless,
   * such as a `404`.
   */
  onRetry?: () => void;
  children?: ReactNode;
}>;

/**
 * The single public state card.
 *
 * Every route boundary had hand-copied the same markup, the same `retryStarted` ref, and the same
 * `useTransition` pending flag, so a fix to any of them was a fix to one of them. The classes are
 * the ones `app/globals.css` already ships — this component deliberately introduces no CSS of its
 * own, and it never renders an internal error message, a status code, or a stack trace.
 */
export function StateCard({
  variant,
  title,
  body,
  titleId,
  headingLevel = 1,
  onRetry,
  children,
}: StateCardProps) {
  const [retrying, startTransition] = useTransition();
  // A retry replaces this tree, so a second activation before that lands would fire a redundant
  // refresh — and, in a boundary, reset an already-reset boundary. One press per mount is enough.
  const retryStarted = useRef(false);
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <section className="publicStateCard" data-state={variant} aria-labelledby={headingId}>
      <Heading id={headingId}>{title}</Heading>
      <p>{body}</p>
      {children}
      {onRetry ? (
        <button
          className="publicRetryButton"
          disabled={retrying}
          type="button"
          onClick={() => {
            if (retryStarted.current) return;
            retryStarted.current = true;
            startTransition(onRetry);
          }}
        >
          {retrying ? message("retrying") : message("retry")}
        </button>
      ) : null}
    </section>
  );
}
