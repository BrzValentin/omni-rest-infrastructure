import Link from "next/link";

import { message } from "@/lib/menu-messages";

import { MenuLink } from "./MenuLink";

/** Which public page the header is rendered on. */
export type PublicPage = "home" | "menu";

/**
 * The one primary navigation link in every public header: "Menu" everywhere except on the menu itself,
 * where it becomes "Home" (BUG-008). A link to the page you are already on is a dead end.
 *
 * The page is passed in by whichever component renders the header rather than read from the URL. Each
 * design already has separate Home and Menu components, so the answer is known at render time on the
 * server, with no `usePathname` and no client JavaScript — which also keeps it correct on a direct load
 * of `/menu/[category]`, after back and forward, and when the category hash changes, because none of
 * those can change which server tree rendered the header.
 */
export function PrimaryNavigationLink({
  className,
  currentPage,
}: Readonly<{ className: string; currentPage: PublicPage }>) {
  if (currentPage === "menu") {
    return (
      <Link className={className} href="/" prefetch={false}>
        {message("home")}
      </Link>
    );
  }
  return <MenuLink className={className}>{message("menu")}</MenuLink>;
}
