import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { getSession } from "@/lib/server-api";
import { safeAdminReturnPath } from "@/lib/auth-contract";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const [session, requestHeaders] = await Promise.all([getSession(), headers()]);
  if (session.status !== 200 || !session.data) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  return (
    <div className={styles.adminShell}>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <header className={styles.adminHeader}>
        <Link href="/admin">Owner Portal</Link>
        <nav aria-label="Owner navigation">
          <Link href="/admin/restaurant">Restaurant</Link>
          <Link href="/admin/restaurant/preview">Preview</Link>
          <LogoutButton />
        </nav>
      </header>
      {children}
    </div>
  );
}
