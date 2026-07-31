import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicShell } from "@/components/PublicShell";
import { CategoryBrowser } from "@/components/menu/CategoryBrowser";
import { getPublicMenu, PublicMenuApiError } from "@/lib/menu-api";
import { message } from "@/lib/menu-messages";

import styles from "@/components/menu/menu.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Menu | Omni REST",
  description: "Browse the restaurant's current published menu.",
};

export default async function MenuPage() {
  let response;
  try {
    response = await getPublicMenu();
  } catch (error) {
    if (error instanceof PublicMenuApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <PublicShell restaurantName={response.restaurantName}>
      <main className={styles.menuMain} id="main-content" lang={response.locale}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>{message("menu")}</p>
          <h1>{response.restaurantName}</h1>
          {response.menu ? <p className={styles.menuName}>{response.menu.name}</p> : null}
        </header>

        {response.taxDisplayMode === "exclusive" ? (
          <p className={styles.taxNotice} role="note">
            {message(response.taxNoticeKey ?? "exclusiveTaxNotice") === response.taxNoticeKey
              ? message("exclusiveTaxNotice")
              : message(response.taxNoticeKey ?? "exclusiveTaxNotice")}
          </p>
        ) : null}

        {!response.menu ? (
          <section className={styles.stateCard} aria-labelledby="no-menu-title">
            <h2 id="no-menu-title">{message("noMenuTitle")}</h2>
            <p>{message("noMenuBody")}</p>
          </section>
        ) : response.menu.categories.length === 0 ? (
          <section className={styles.stateCard} aria-labelledby="no-categories-title">
            <h2 id="no-categories-title">{message("noCategoriesTitle")}</h2>
            <p>{message("noCategoriesBody")}</p>
          </section>
        ) : (
          <>
            <CategoryBrowser categories={response.menu.categories} currency={response.currency} locale={response.locale} />
            <p className={styles.disclaimer} role="note">
              {message("badgesDisclaimer")}
            </p>
          </>
        )}
      </main>
    </PublicShell>
  );
}
