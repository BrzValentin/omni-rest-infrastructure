import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { readAdminRestaurant } from "@/lib/admin-data";
import { getSession } from "@/lib/server-api";
import { safeAdminReturnPath } from "@/lib/auth-contract";
import { nonIndexableMetadata } from "@/lib/seo";
import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

/**
 * The portal instance is bound to exactly one restaurant — the one this host resolves to — so the
 * document title names it. Without that, every owner's portal looked identical and nothing told them
 * which restaurant they were about to edit (PR-21 Task 8).
 */
export async function generateMetadata(): Promise<Metadata> {
  const restaurant = await readAdminRestaurant();
  return nonIndexableMetadata({
    title: restaurant ? `${restaurant.name} · Owner Portal` : "Owner Portal",
  });
}

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const [session, requestHeaders] = await Promise.all([getSession(), headers()]);
  if (session.status !== 200 || !session.data) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  const restaurant = await readAdminRestaurant();
  // The name is shown only for a restaurant this session actually holds a membership for. The backend
  // is what enforces ownership on every request; this keeps the chrome from ever labelling the portal
  // with a restaurant the signed-in owner has no claim to, which is the one thing the UI can get wrong
  // on its own. There is no restaurant switcher and no restaurant id in any URL: the single navigation
  // below is the complete set of surfaces, and every one of them is scoped to this restaurant.
  const managed = restaurant
    && session.data.memberships.some((membership) => membership.restaurantId === restaurant.id)
    ? restaurant
    : null;

  return (
    <div className={styles.adminShell}>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <header className={styles.adminHeader}>
        <Link className={styles.portalBrand} href="/admin">
          <span>Owner Portal</span>
          {managed ? <span className={styles.managedRestaurant}>{managed.name}</span> : null}
        </Link>
        <nav aria-label="Owner navigation">
          <Link href="/admin/restaurant">My Restaurant</Link>
          <Link href="/admin/menu">My Menu</Link>
          <Link href="/admin/menu/dishes">My Dishes</Link>
          <Link href="/admin/gallery">My Gallery</Link>
          {/* Hours are edited in the restaurant profile rather than on a page of their own, so this
              names the section instead of inventing a route. */}
          <Link href="/admin/restaurant#hours-title">My Hours</Link>
          <Link href="/admin/restaurant/preview">Preview</Link>
          <Link href="/admin/design">Design</Link>
          <LogoutButton />
        </nav>
      </header>
      {children}
    </div>
  );
}
