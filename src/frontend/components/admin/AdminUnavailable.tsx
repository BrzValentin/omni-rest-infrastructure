"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";

import { message, type MessageKey } from "@/lib/menu-messages";
import styles from "@/app/admin/admin.module.css";

/**
 * Why this owner is looking at an empty section.
 *
 * - `unavailable` — the read failed. Nothing the owner saved is affected and retrying may work.
 * - `empty` — the read succeeded and the section genuinely has nothing in it yet.
 */
export type AdminUnavailableReason = "unavailable" | "empty";

type AdminUnavailableProps = Readonly<{
  reason: AdminUnavailableReason;
  /** Message key naming the section, e.g. `"admin.section.menu"`. */
  section: MessageKey;
}>;

/**
 * The owner portal's dead-end state.
 *
 * Six pages each hand-rolled their own `<h1>Something unavailable</h1><p>Try again in a few
 * minutes.</p>`, all of them keyed on nothing but `!result.data`. That made an outage and an
 * unconfigured section render identically — an owner told to "try again in a few minutes" would wait
 * out a section that was only ever going to be empty until they filled it in — and none of the six
 * offered any way to retry short of reloading the browser.
 *
 * The retry is a client-side `router.refresh()`, which re-runs the server component that produced
 * this state without discarding anything else on the page. Like the public `StateCard`, it fires at
 * most once per mount.
 */
export function AdminUnavailable({ reason, section }: AdminUnavailableProps) {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();
  const retryStarted = useRef(false);
  const unavailable = reason === "unavailable";

  return (
    <main className={styles.adminMain} id="main-content">
      <p className={styles.eyebrow}>{message(section)}</p>
      <h1>{message(unavailable ? "adminUnavailableTitle" : "adminEmptyTitle")}</h1>
      <p>{message(unavailable ? "adminUnavailableBody" : "adminEmptyBody")}</p>
      {unavailable ? (
        <button
          className={styles.primaryButton}
          disabled={retrying}
          type="button"
          onClick={() => {
            if (retryStarted.current) return;
            retryStarted.current = true;
            startTransition(() => router.refresh());
          }}
        >
          {message(retrying ? "adminRetrying" : "adminRetry")}
        </button>
      ) : null}
    </main>
  );
}
