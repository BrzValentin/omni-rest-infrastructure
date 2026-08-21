import { MenuLink } from "@/components/MenuLink";
import { PublicShell } from "@/components/PublicShell";
import { CallButton } from "@/components/phone/CallButton";
import type { WebsiteDesignHomeProps } from "../design-contract";
import { createDesignClassNames } from "../shared/designClassNames";
import Image from "next/image";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const styles = createDesignClassNames("legacy-current-v1");

export default function LegacyHome({ restaurant }: WebsiteDesignHomeProps) {
  const image = restaurant?.mainImage?.variants.at(-1);
  return (
    <div data-website-design="legacy-current-v1">
      <PublicShell restaurantName={restaurant?.name}>
        <main className={styles.homeMain} id="main-content">
          <section className={styles.homeCard} aria-labelledby="page-title">
          {image ? <Image className={styles.homeImage} src={image.url} width={image.width} height={image.height} sizes="(max-width: 704px) 100vw, 704px" alt={restaurant?.mainImage?.altText ?? ""} priority /> : null}
          <p className={styles.eyebrow}>Welcome</p>
          <h1 id="page-title">{restaurant?.name ?? "Omni REST"}</h1>
          <p>{restaurant?.shortDescription ?? "Discover the restaurant's current published dishes."}</p>
          {restaurant ? <p className={styles.restaurantStatus}><strong>{restaurant.status.label}</strong></p> : null}
          <div className={styles.homeActions}>
            <MenuLink className={styles.primaryLink}>Browse the menu</MenuLink>
            {restaurant?.phone ? <CallButton e164={restaurant.phone.e164} display={restaurant.phone.display} /> : null}
          </div>
          {restaurant?.email ? <p><a href={`mailto:${restaurant.email}`}>{restaurant.email}</a></p> : null}
          {restaurant?.address ? <address className={styles.restaurantAddress}><span>{restaurant.address.formatted}</span><a href={restaurant.address.directionsUrl} rel="noreferrer">Get directions</a></address> : null}
          {restaurant ? <section aria-labelledby="public-hours"><h2 id="public-hours">Hours</h2><dl className={styles.publicHours}>{restaurant.regularHours.map((day) => <div key={day.dayOfWeek}><dt>{days[day.dayOfWeek]}</dt><dd>{day.intervals.length === 0 ? "Closed" : day.intervals.map((period) => `${period.opensAt.slice(0, 5)}–${period.closesAt.slice(0, 5)}${period.closesNextDay ? " next day" : ""}`).join(", ")}</dd></div>)}</dl></section> : null}
          {restaurant && restaurant.specialHours.length > 0 ? <section aria-labelledby="public-special"><h2 id="public-special">Special hours</h2><ul>{restaurant.specialHours.map((day) => <li key={day.date}><strong>{day.date}</strong>: {day.isClosed ? "Closed" : day.intervals.map((period) => `${period.opensAt.slice(0, 5)}–${period.closesAt.slice(0, 5)}`).join(", ")} {day.note}</li>)}</ul></section> : null}
          {restaurant && restaurant.socialLinks.length > 0 ? <nav aria-label="Social media" className={styles.publicSocial}>{restaurant.socialLinks.map((link) => <a key={link.platform} href={link.url} rel="noreferrer">{link.platform}</a>)}</nav> : null}
          </section>
        </main>
      </PublicShell>
    </div>
  );
}
