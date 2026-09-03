import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AdminNavLink } from "@/components/admin/AdminNavLink";
import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { readAdminRestaurant } from "@/lib/admin-data";
import { getSession, UNREACHABLE_API } from "@/lib/server-api";
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
  // `getSession()` rejects on a transport fault, and an unguarded rejection here escapes the whole
  // portal to the chrome-less root boundary — the owner lost their navigation as well as their page.
  const [session, requestHeaders] = await Promise.all([
    getSession().catch(() => UNREACHABLE_API),
    headers(),
  ]);
  // A backend that cannot answer is not a signed-out owner, so it must not be answered with a trip
  // to the login form the owner cannot complete either.
  if (session.status === 0 || session.status >= 500) {
    return <AdminUnavailable reason="unavailable" section="admin.section.portal" />;
  }
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
        {/* Every link here is an `AdminNavLink`: a client-side route change never fires
            `beforeunload`, so the portal's own navigation was the one way to lose an edit in
            silence. The link asks before walking away from unsaved work. */}
        <AdminNavLink className={styles.portalBrand} href="/admin">
          <span>Owner Portal</span>
          {managed ? <span className={styles.managedRestaurant}>{managed.name}</span> : null}
        </AdminNavLink>
        <nav aria-label="Owner navigation">
          <AdminNavLink href="/admin/restaurant">My Restaurant</AdminNavLink>
          <AdminNavLink href="/admin/menu">My Menu</AdminNavLink>
          <AdminNavLink href="/admin/menu/dishes">My Dishes</AdminNavLink>
          <AdminNavLink href="/admin/gallery">My Gallery</AdminNavLink>
          {/* Hours are edited in the restaurant profile rather than on a page of their own, so this
              names the section instead of inventing a route. */}
          <AdminNavLink href="/admin/restaurant#hours-title">My Hours</AdminNavLink>
          <AdminNavLink href="/admin/restaurant/preview">Preview</AdminNavLink>
          <AdminNavLink href="/admin/design">Design</AdminNavLink>
          <AdminNavLink href="/admin/qr-code">My QR Code</AdminNavLink>
          <LogoutButton />
        </nav>
      </header>
      {children}
    </div>
  );
}
