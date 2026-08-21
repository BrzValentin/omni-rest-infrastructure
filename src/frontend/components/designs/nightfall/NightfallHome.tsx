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

const styles = createDesignClassNames("nightfall-v1");

export default function NightfallHome({ restaurant }: WebsiteDesignHomeProps) {
  const name = restaurant?.name ?? "Omni REST";
  return (
    <div className={styles.shell} data-website-design="nightfall-v1">
      <DesignSkipLink className={styles.skipLink} />
      <header className={styles.header}>
        <HomeLink className={styles.brand} restaurantName={name} />
        <nav aria-label="Primary navigation">
          <MenuNavigationLink className={styles.navLink} />
        </nav>
      </header>
      <main className={styles.homeMain} id="main-content">
        <section className={styles.hero} aria-labelledby="nightfall-title">
          <RestaurantHeroImage
            restaurant={restaurant}
            className={styles.heroImage}
            sizes="100vw"
          />
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>After dark</p>
            <h1 id="nightfall-title">{name}</h1>
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
        </section>
        {restaurant ? (
          <>
            <div className={styles.detailsGrid}>
              <RestaurantHours
                restaurant={restaurant}
                className={styles.hoursSection}
                headingId="nightfall-hours"
              />
              <RestaurantContact
                restaurant={restaurant}
                className={styles.detailSection}
                linkClassName={styles.textLink}
                headingId="nightfall-visit"
              />
            </div>
            <RestaurantSpecialHours
              restaurant={restaurant}
              className={styles.specialSection}
              headingId="nightfall-special"
            />
            <RestaurantSocialLinks restaurant={restaurant} className={styles.socialLinks} />
          </>
        ) : null}
      </main>
      <DesignFooter className={styles.footer} restaurantName={name} />
    </div>
  );
}
