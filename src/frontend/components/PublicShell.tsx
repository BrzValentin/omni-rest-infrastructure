import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { brandInitials, brandLogoVariant } from "@/lib/brand";
import { message } from "@/lib/menu-messages";
import type { PublicImage } from "@/lib/restaurant-contract";

import { MenuLink } from "./MenuLink";

type PublicShellProps = Readonly<{
  restaurantName?: string;
  logo?: PublicImage | null;
  children: ReactNode;
}>;

/**
 * The chrome shared by the legacy design and by the states that render before a restaurant is known
 * (the `404` pages and the error boundary).
 *
 * There is deliberately no default restaurant name. The shell used to fall back to the platform's own
 * brand, which on a multi-tenant platform means every unresolved request advertised a name that
 * belongs to no tenant on that host. When the restaurant is unknown the header carries a plain home
 * link and no brand mark at all.
 */
export function PublicShell({ restaurantName, logo, children }: PublicShellProps) {
  const name = restaurantName?.trim() ? restaurantName.trim() : null;
  const logoVariant = brandLogoVariant(logo);
  const initials = brandInitials(name);

  return (
    <div className="publicShell">
      <a className="publicSkipLink" href="#main-content">
        {message("skipToContent")}
      </a>
      <header className="publicHeader">
        <Link
          className="publicBrand"
          href="/"
          prefetch={false}
          aria-label={name ? `${name} home` : message("home")}
        >
          {logoVariant ? (
            <Image
              className="publicBrandLogo"
              src={logoVariant.url}
              width={logoVariant.width}
              height={logoVariant.height}
              sizes="2.5rem"
              alt=""
            />
          ) : initials ? (
            <span aria-hidden="true" className="publicBrandMark">
              {initials}
            </span>
          ) : null}
          <span>{name ?? message("home")}</span>
        </Link>
        <nav aria-label="Primary navigation">
          <MenuLink className="publicNavLink">{message("menu")}</MenuLink>
        </nav>
      </header>
      {children}
      <footer className="publicFooter">{name ? <p>{name}</p> : null}</footer>
    </div>
  );
}
