import Link from "next/link";
import type { ReactNode } from "react";

import { message } from "@/lib/menu-messages";

import { MenuLink } from "./MenuLink";
import styles from "./PublicShell.module.css";

type PublicShellProps = Readonly<{
  restaurantName?: string;
  children: ReactNode;
}>;

export function PublicShell({ restaurantName = "Omni REST", children }: PublicShellProps) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        {message("skipToContent")}
      </a>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label={`${restaurantName} home`}>
          <span aria-hidden="true" className={styles.brandMark}>
            OR
          </span>
          <span>{restaurantName}</span>
        </Link>
        <nav aria-label="Primary navigation">
          <MenuLink className={styles.navLink}>{message("menu")}</MenuLink>
        </nav>
      </header>
      {children}
      <footer className={styles.footer}>
        <p>{restaurantName}</p>
      </footer>
    </div>
  );
}
