import { MenuLink } from "@/components/MenuLink";
import { PublicShell } from "@/components/PublicShell";
import { CallButton } from "@/components/phone/CallButton";
import { getPublicRestaurant } from "@/lib/server-api";
import Image from "next/image";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const dynamic = "force-dynamic";

export default async function Home() {
  const result = await getPublicRestaurant().catch(() => ({ status: 503, data: null }));
  const restaurant = result.data;
  const image = restaurant?.mainImage?.variants.at(-1);
  return (
    <PublicShell restaurantName={restaurant?.name}>
      <main className="homeMain" id="main-content">
        <section className="homeCard" aria-labelledby="page-title">
          {image && <Image className="homeImage" src={image.url} width={image.width} height={image.height} sizes="(max-width: 704px) 100vw, 704px" alt={restaurant?.mainImage?.altText ?? ""} />}
          <p className="eyebrow">Welcome</p>
          <h1 id="page-title">{restaurant?.name ?? "Omni REST"}</h1>
          <p>{restaurant?.shortDescription ?? "Discover the restaurant's current published dishes."}</p>
          {restaurant && <p className="restaurantStatus"><strong>{restaurant.status.label}</strong></p>}
          <div className="homeActions">
            <MenuLink className="primaryLink">Browse the menu</MenuLink>
            {restaurant?.phone && <CallButton e164={restaurant.phone.e164} display={restaurant.phone.display} />}
          </div>
          {restaurant?.email && <p><a href={`mailto:${restaurant.email}`}>{restaurant.email}</a></p>}
          {restaurant?.address && <address className="restaurantAddress">
            <span>{restaurant.address.formatted}</span>
            <a href={restaurant.address.directionsUrl} rel="noreferrer">Get directions</a>
          </address>}
          {restaurant && <section aria-labelledby="public-hours"><h2 id="public-hours">Hours</h2><dl className="publicHours">{restaurant.regularHours.map((day) => <div key={day.dayOfWeek}><dt>{DAYS[day.dayOfWeek]}</dt><dd>{day.intervals.length === 0 ? "Closed" : day.intervals.map((period) => `${period.opensAt.slice(0, 5)}–${period.closesAt.slice(0, 5)}${period.closesNextDay ? " next day" : ""}`).join(", ")}</dd></div>)}</dl></section>}
          {restaurant && restaurant.specialHours.length > 0 && <section aria-labelledby="public-special"><h2 id="public-special">Special hours</h2><ul>{restaurant.specialHours.map((day) => <li key={day.date}><strong>{day.date}</strong>: {day.isClosed ? "Closed" : day.intervals.map((period) => `${period.opensAt.slice(0, 5)}–${period.closesAt.slice(0, 5)}`).join(", ")} {day.note}</li>)}</ul></section>}
          {restaurant && restaurant.socialLinks.length > 0 && <nav aria-label="Social media" className="publicSocial">{restaurant.socialLinks.map((link) => <a key={link.platform} href={link.url} rel="noreferrer">{link.platform}</a>)}</nav>}
        </section>
      </main>
    </PublicShell>
  );
}
