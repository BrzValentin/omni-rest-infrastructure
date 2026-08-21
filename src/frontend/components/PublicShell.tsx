import Link from "next/link";
import type { ReactNode } from "react";

import { message } from "@/lib/menu-messages";

import { MenuLink } from "./MenuLink";

type PublicShellProps = Readonly<{
  restaurantName?: string;
  children: ReactNode;
}>;

export function PublicShell({ restaurantName = "Omni REST", children }: PublicShellProps) {
  return (
    <div className="publicShell">
      <a className="publicSkipLink" href="#main-content">
        {message("skipToContent")}
      </a>
      <header className="publicHeader">
        <Link className="publicBrand" href="/" prefetch={false} aria-label={`${restaurantName} home`}>
          <span aria-hidden="true" className="publicBrandMark">
            OR
          </span>
          <span>{restaurantName}</span>
        </Link>
        <nav aria-label="Primary navigation">
          <MenuLink className="publicNavLink">{message("menu")}</MenuLink>
        </nav>
      </header>
      {children}
      <footer className="publicFooter">
        <p>{restaurantName}</p>
      </footer>
    </div>
  );
}
