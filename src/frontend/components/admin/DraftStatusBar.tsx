"use client";

import type { ReactNode } from "react";
import { safeAdminReturnPath } from "@/lib/auth-contract";
import type { PublicationStatus } from "@/lib/restaurant-contract";
import styles from "@/app/admin/admin.module.css";

/**
 * What the owner is told when their sign-in expired mid-save.
 *
 * A 401 used to fall through to the generic "Saving failed" copy, which sent an owner round the
 * retry loop forever. Nothing typed is thrown away: the form keeps its contents and the status bar
 * offers the way back in.
 */
export const sessionExpiredNotice = "Your session ended — sign in again. Everything you typed is still here.";

/** Short status-bar wording for a publication state. Never shows the raw state name. */
export function publishingLabel(publication: PublicationStatus | null | undefined): string {
  switch (publication?.status) {
    case "succeeded": return "Website up to date";
    case "pending":
    case "processing": return "Website updating now";
    case "failed": return "Website update did not finish";
    default: return "Not published yet";
  }
}

/** Sentence appended to a "saved" confirmation. Never shows the raw state name. */
export function publishingSentence(status: string | null | undefined): string {
  switch (status) {
    case "succeeded": return "Your website is up to date.";
    case "pending":
    case "processing": return "Your website is updating now.";
    case "failed": return "Your website could not be updated yet; we keep trying.";
    default: return "Your website will update shortly.";
  }
}

/** The login route to send an owner to, coming back to the page they were editing. */
export function adminSignInHref(): string {
  const current = typeof window === "undefined"
    ? "/admin"
    : `${window.location.pathname}${window.location.search}`;
  return `/admin/login?returnPath=${encodeURIComponent(safeAdminReturnPath(current))}`;
}

/**
 * The sticky bar at the top of every editor.
 *
 * It replaces four hand-rolled copies that leaked internal vocabulary at the owner — a draft version
 * number and a raw publication state — and it is where the two recovery affordances live: signing in
 * again after a session expiry, and re-issuing a save that failed for a reason the owner cannot fix
 * by editing a field.
 */
export function DraftStatusBar({
  publication,
  notice,
  conflict,
  sessionExpired = false,
  onRetry = null,
  busy = false,
  children,
}: Readonly<{
  publication: PublicationStatus | null;
  notice: string | null;
  conflict: boolean;
  sessionExpired?: boolean;
  onRetry?: (() => void) | null;
  busy?: boolean;
  children?: ReactNode;
}>) {
  return (
    <div className={styles.statusBar} role="status" aria-live="polite">
      <span>{publication ? "Last saved" : "Not saved yet"}</span>
      <span>{publishingLabel(publication)}</span>
      {children}
      {notice && <strong>{notice}</strong>}
      {sessionExpired && <a className={styles.primaryLink} href={adminSignInHref()}>Sign in again</a>}
      {onRetry && <button type="button" disabled={busy} onClick={onRetry}>Try again</button>}
      {conflict && <button type="button" onClick={() => window.location.reload()}>Reload latest</button>}
    </div>
  );
}
