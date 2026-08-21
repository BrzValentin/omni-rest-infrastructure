import { PublicShell } from "@/components/PublicShell";
import { message } from "@/lib/menu-messages";
import type { WebsiteDesignMenuProps } from "../design-contract";
import { DesignMenuBrowser, type DesignMenuClasses } from "../shared/DesignMenuBrowser";
import { MenuRestaurantActions } from "../shared/PublicDesignParts";
import { createDesignClassNames } from "../shared/designClassNames";

const styles = createDesignClassNames("legacy-current-v1");

const menuClasses: DesignMenuClasses = {
  browser: styles.browser,
  categoryNav: styles.categoryNav,
  categoryStrip: styles.categoryStrip,
  categoryLink: styles.categoryLink,
  panels: styles.panels,
  panel: styles.panel,
  categoryHeading: styles.categoryHeading,
  emptyCategory: styles.emptyCategory,
  dishGrid: styles.dishGrid,
  dishCard: styles.dishCard,
  unavailableCard: styles.unavailableCard,
  mediaFrame: styles.mediaFrame,
  mediaPlaceholder: styles.mediaPlaceholder,
  dishBody: styles.dishBody,
  dishHeading: styles.dishHeading,
  price: styles.price,
  unavailable: styles.unavailable,
  description: styles.description,
  badges: styles.badges,
  badge: styles.badge,
  allergenBadge: styles.allergenBadge,
};

export default function LegacyMenu({ site }: WebsiteDesignMenuProps) {
  return (
    <div data-website-design="legacy-current-v1">
      <PublicShell restaurantName={site.restaurantName}>
        <main className={styles.menuMain} id="main-content" lang={site.locale}>
          <header className={styles.menuHero}>
            <p className={styles.eyebrow}>{message("menu")}</p>
            <h1>{site.restaurantName}</h1>
            {site.menu ? <p className={styles.menuName}>{site.menu.name}</p> : null}
          </header>
          <MenuRestaurantActions
            restaurant={site.restaurant}
            className={styles.actions}
            actionClassName={styles.secondaryAction}
          />
          {site.taxDisplayMode === "exclusive" ? <p className={styles.notice} role="note">{message(site.taxNoticeKey ?? "exclusiveTaxNotice") === site.taxNoticeKey ? message("exclusiveTaxNotice") : message(site.taxNoticeKey ?? "exclusiveTaxNotice")}</p> : null}
          {!site.menu ? (
            <section className={styles.stateCard} aria-labelledby="no-menu-title"><h2 id="no-menu-title">{message("noMenuTitle")}</h2><p>{message("noMenuBody")}</p></section>
          ) : site.menu.categories.length === 0 ? (
            <section className={styles.stateCard} aria-labelledby="no-categories-title"><h2 id="no-categories-title">{message("noCategoriesTitle")}</h2><p>{message("noCategoriesBody")}</p></section>
          ) : (
            <><DesignMenuBrowser categories={site.menu.categories} currency={site.currency} locale={site.locale} classes={menuClasses} /><p className={styles.disclaimer} role="note">{message("badgesDisclaimer")}</p></>
          )}
        </main>
      </PublicShell>
    </div>
  );
}
