import type { WebsiteDesignHomeProps } from "../design-contract";
import {
  DesignFooter,
  DesignSkipLink,
  HomeLink,
  MenuNavigationLink,
  RestaurantActions,
  RestaurantContact,
  RestaurantHeroImage,
  RestaurantHours,
  RestaurantSocialLinks,
  RestaurantSpecialHours,
} from "../shared/PublicDesignParts";
import { createDesignClassNames } from "../shared/designClassNames";

const styles = createDesignClassNames("broadsheet-v1");

export default function BroadsheetHome({ restaurant }: WebsiteDesignHomeProps) {
  const name = restaurant?.name ?? "Omni REST";
  return (
    <div className={styles.shell} data-website-design="broadsheet-v1">
      <DesignSkipLink className={styles.skipLink} />
      <header className={styles.header}>
        <p className={styles.edition}>Today&apos;s edition</p>
        <HomeLink className={styles.brand} restaurantName={name} />
        <nav aria-label="Primary navigation"><MenuNavigationLink className={styles.navLink} /></nav>
      </header>
      <main className={styles.homeMain} id="main-content">
        <section className={styles.hero} aria-labelledby="broadsheet-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Food · Place · People</p>
            <h1 id="broadsheet-title">{name}</h1>
            {restaurant?.shortDescription ? (
              <p className={styles.intro}>{restaurant.shortDescription}</p>
            ) : null}
            {restaurant ? <p className={styles.status}>{restaurant.status.label}</p> : null}
            <RestaurantActions
              restaurant={restaurant}
              className={styles.actions}
              menuClassName={styles.primaryAction}
              actionClassName={styles.secondaryAction}
            />
          </div>
          <RestaurantHeroImage
            restaurant={restaurant}
            className={styles.heroImage}
            sizes="(max-width: 52rem) 100vw, 52vw"
          />
        </section>
        {restaurant ? (
          <>
            <div className={styles.detailsGrid}>
              <RestaurantContact restaurant={restaurant} className={styles.detailSection} linkClassName={styles.textLink} headingId="sheet-visit" />
              <RestaurantHours restaurant={restaurant} className={styles.hoursSection} headingId="sheet-hours" />
            </div>
            <RestaurantSpecialHours restaurant={restaurant} className={styles.specialSection} headingId="sheet-special" />
            <RestaurantSocialLinks restaurant={restaurant} className={styles.socialLinks} />
          </>
        ) : null}
      </main>
      <DesignFooter className={styles.footer} restaurantName={name} />
    </div>
  );
}
