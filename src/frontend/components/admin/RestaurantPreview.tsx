import Image from "next/image";
import Link from "next/link";
import { CallButton } from "@/components/phone/CallButton";
import { PhoneLink } from "@/components/phone/PhoneLink";
import type { PublicRestaurant } from "@/lib/restaurant-contract";
import styles from "@/app/admin/admin.module.css";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function RestaurantPreview({ restaurant }: { restaurant: PublicRestaurant }) {
  const image = restaurant.mainImage?.variants.at(-1);
  return (
    <main id="main-content" className={styles.previewMain}>
      <aside className={styles.previewBanner} aria-label="Draft preview notice">
        <strong>Draft preview</strong><span>Only signed-in owners can see this page. These changes may not be published yet.</span><Link href="/admin/restaurant">Back to editor</Link>
      </aside>
      <article className={styles.previewCard}>
        {image && <Image className={styles.previewHero} src={image.url} width={image.width} height={image.height} sizes="(max-width: 800px) 100vw, 800px" alt={restaurant.mainImage?.altText ?? ""} />}
        <p className={styles.eyebrow}>{restaurant.status.label}</p>
        <h1>{restaurant.name}</h1>
        {restaurant.shortDescription && <p>{restaurant.shortDescription}</p>}
        {restaurant.phone && <div className={styles.buttonRow}><CallButton e164={restaurant.phone.e164} display={restaurant.phone.display} /><PhoneLink e164={restaurant.phone.e164}>{restaurant.phone.display}</PhoneLink></div>}
        {restaurant.email && <p><a href={`mailto:${restaurant.email}`}>{restaurant.email}</a></p>}
        {restaurant.address && <address className={styles.previewAddress}>{restaurant.address.formatted}<a href={restaurant.address.directionsUrl} rel="noreferrer">Get directions</a></address>}
        <section aria-labelledby="preview-hours"><h2 id="preview-hours">Hours</h2><dl className={styles.hoursList}>{restaurant.regularHours.map((day) => <div key={day.dayOfWeek}><dt>{DAYS[day.dayOfWeek]}</dt><dd>{day.intervals.length === 0 ? "Closed" : day.intervals.map((item) => `${item.opensAt.slice(0, 5)}–${item.closesAt.slice(0, 5)}${item.closesNextDay ? " next day" : ""}`).join(", ")}</dd></div>)}</dl></section>
        {restaurant.specialHours.length > 0 && <section aria-labelledby="preview-special"><h2 id="preview-special">Special hours</h2><ul>{restaurant.specialHours.map((item) => <li key={item.date}><strong>{item.date}</strong>: {item.isClosed ? "Closed" : item.intervals.map((period) => `${period.opensAt.slice(0, 5)}–${period.closesAt.slice(0, 5)}`).join(", ")} {item.note}</li>)}</ul></section>}
        {restaurant.socialLinks.length > 0 && <nav aria-label="Social media" className={styles.socialLinks}>{restaurant.socialLinks.map((link) => <a key={link.platform} href={link.url} rel="noreferrer">{link.platform}</a>)}</nav>}
      </article>
    </main>
  );
}
