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

const styles = createDesignClassNames("quiet-elegance-v1");

export default function QuietEleganceHome({ restaurant }: WebsiteDesignHomeProps) {
  const name = restaurant?.name ?? "Omni REST";
  return (
    <div className={styles.shell} data-website-design="quiet-elegance-v1">
      <DesignSkipLink className={styles.skipLink} />
      <header className={styles.header}>
        <HomeLink className={styles.brand} restaurantName={name} />
        <nav aria-label="Primary navigation"><MenuNavigationLink className={styles.navLink} /></nav>
      </header>
      <main className={styles.homeMain} id="main-content">
        <section className={styles.hero} aria-labelledby="quiet-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Welcome</p>
            <h1 id="quiet-title">{name}</h1>
            {restaurant?.shortDescription ? <p className={styles.intro}>{restaurant.shortDescription}</p> : null}
            {restaurant ? <p className={styles.status}>{restaurant.status.label}</p> : null}
            <RestaurantActions restaurant={restaurant} className={styles.actions} menuClassName={styles.primaryAction} actionClassName={styles.secondaryAction} />
          </div>
          <RestaurantHeroImage restaurant={restaurant} className={styles.heroImage} sizes="(max-width: 52rem) 100vw, 50vw" />
        </section>
        {restaurant ? (
          <>
            <div className={styles.detailsGrid}>
              <RestaurantContact restaurant={restaurant} className={styles.detailSection} linkClassName={styles.textLink} headingId="quiet-visit" />
              <RestaurantHours restaurant={restaurant} className={styles.hoursSection} headingId="quiet-hours" />
            </div>
            <RestaurantSpecialHours restaurant={restaurant} className={styles.specialSection} headingId="quiet-special" />
            <RestaurantSocialLinks restaurant={restaurant} className={styles.socialLinks} />
          </>
        ) : null}
      </main>
      <DesignFooter className={styles.footer} restaurantName={name} />
    </div>
  );
}
