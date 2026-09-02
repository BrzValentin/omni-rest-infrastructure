"use client";

import { useRouter } from "next/navigation";

import { PublicShell } from "@/components/PublicShell";
import { StateCard, useReportedDigest } from "@/components/state/StateCard";
import { message } from "@/lib/menu-messages";

/**
 * Menu error boundary. Unlike the root boundary this one keeps `PublicShell`: reaching `/menu` means
 * the tenant resolved, so the chrome has a restaurant to belong to and the reader keeps their way out.
 */
export default function MenuError({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  const router = useRouter();
  useReportedDigest(error);

  return (
    <PublicShell>
      <main className="publicMenuMain" id="main-content">
        <StateCard
          variant="error"
          titleId="menu-error-title"
          title={message("errorTitle")}
          body={message("errorBody")}
          onRetry={() => {
            router.refresh();
            reset();
          }}
        />
      </main>
    </PublicShell>
  );
}
