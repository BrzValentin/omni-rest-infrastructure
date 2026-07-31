"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import { PublicShell } from "@/components/PublicShell";
import { message } from "@/lib/menu-messages";

import styles from "@/components/menu/menu.module.css";

export default function MenuError({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const [retrying, startTransition] = useTransition();
  const retryStarted = useRef(false);
  const router = useRouter();

  return (
    <PublicShell>
      <main className={styles.menuMain} id="main-content">
        <section className={styles.stateCard} aria-labelledby="menu-error-title">
          <h1 id="menu-error-title">{message("errorTitle")}</h1>
          <p>{message("errorBody")}</p>
          <button
            className={styles.retryButton}
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
    </PublicShell>
  );
}
