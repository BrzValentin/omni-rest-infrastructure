import { message } from "@/lib/menu-messages";
import type { WebsiteDesignMenuProps } from "../design-contract";
import { DesignMenuBrowser, type DesignMenuClasses } from "../shared/DesignMenuBrowser";
import {
  DesignFooter,
  DesignSkipLink,
  HomeLink,
  MenuNavigationLink,
  MenuRestaurantActions,
} from "../shared/PublicDesignParts";
import { createDesignClassNames } from "../shared/designClassNames";

const styles = createDesignClassNames("quiet-elegance-v1");

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

export default function QuietEleganceMenu({ site }: WebsiteDesignMenuProps) {
  return (
    <div className={styles.shell} data-website-design="quiet-elegance-v1">
      <DesignSkipLink className={styles.skipLink} />
      <header className={styles.header}>
        <HomeLink className={styles.brand} restaurantName={site.restaurantName} />
        <nav aria-label="Primary navigation"><MenuNavigationLink className={styles.navLink} /></nav>
      </header>
      <main className={styles.menuMain} id="main-content" lang={site.locale}>
        <header className={styles.menuHero}>
          <p className={styles.eyebrow}>The menu</p>
          <h1>{site.restaurantName}</h1>
          {site.menu ? <p>{site.menu.name}</p> : null}
        </header>
        <MenuRestaurantActions
          restaurant={site.restaurant}
          className={styles.actions}
          actionClassName={styles.secondaryAction}
        />
        {site.taxDisplayMode === "exclusive" ? <p className={styles.notice} role="note">{taxMessage(site.taxNoticeKey)}</p> : null}
        {!site.menu ? (
          <section className={styles.stateCard} aria-labelledby="quiet-no-menu"><h2 id="quiet-no-menu">{message("noMenuTitle")}</h2><p>{message("noMenuBody")}</p></section>
        ) : site.menu.categories.length === 0 ? (
          <section className={styles.stateCard} aria-labelledby="quiet-no-categories"><h2 id="quiet-no-categories">{message("noCategoriesTitle")}</h2><p>{message("noCategoriesBody")}</p></section>
        ) : (
          <><DesignMenuBrowser categories={site.menu.categories} currency={site.currency} locale={site.locale} classes={menuClasses} /><p className={styles.disclaimer} role="note">{message("badgesDisclaimer")}</p></>
        )}
      </main>
      <DesignFooter className={styles.footer} restaurantName={site.restaurantName} />
    </div>
  );
}

function taxMessage(key: string | null): string {
  const translated = message(key ?? "exclusiveTaxNotice");
  return translated === key ? message("exclusiveTaxNotice") : translated;
}
