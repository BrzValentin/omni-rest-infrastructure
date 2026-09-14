import { message } from "@/lib/menu-messages";
import type { WebsiteDesignHomeProps } from "../design-contract";
import { DesignGallery } from "../shared/DesignGallery";
import {
  DesignFooter,
  DesignSkipLink,
  HomeLink,
  PrimaryNavigationLink,
  RestaurantAbout,
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
  const name = restaurant?.name ?? message("unnamedRestaurant");
  const gallery = restaurant?.gallery ?? [];
  return (
    <div className={styles.shell} data-website-design="nightfall-v1">
      <DesignSkipLink className={styles.skipLink} />
      <header className={styles.header}>
        <HomeLink className={styles.brand} restaurantName={name} logo={restaurant?.logo} logoClassName={styles.brandLogo} />
        <nav aria-label="Primary navigation">
          <PrimaryNavigationLink className={styles.navLink} currentPage="home" />
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
            <RestaurantAbout restaurant={restaurant} className={styles.specialSection} headingId="nightfall-about" />
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
            {gallery.length > 0 ? (
              <DesignGallery photos={gallery} classes={styles} headingId="night-gallery" restaurantName={name} />
            ) : null}
            <RestaurantSocialLinks restaurant={restaurant} className={styles.socialLinks} />
          </>
        ) : null}
      </main>
      <DesignFooter className={styles.footer} restaurantName={name} />
    </div>
  );
}
