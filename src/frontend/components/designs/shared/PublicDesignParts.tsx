import Image from "next/image";
import Link from "next/link";

import { MenuLink } from "@/components/MenuLink";
import { PhoneLink } from "@/components/phone/PhoneLink";
import type { PublicRestaurant } from "@/lib/restaurant-contract";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function DesignSkipLink({ className }: Readonly<{ className: string }>) {
  return <a className={className} href="#main-content">Skip to content</a>;
}

export function HomeLink({ className, restaurantName }: Readonly<{ className: string; restaurantName: string }>) {
  return <Link className={className} href="/" prefetch={false} aria-label={`${restaurantName} home`}>{restaurantName}</Link>;
}

export function MenuNavigationLink({ className }: Readonly<{ className: string }>) {
  return <MenuLink className={className}>Menu</MenuLink>;
}

export function RestaurantHeroImage({
  restaurant,
  className,
  sizes,
}: Readonly<{ restaurant: PublicRestaurant | null; className: string; sizes: string }>) {
  const image = restaurant?.mainImage?.variants.at(-1);
  if (!image || !restaurant?.mainImage) return null;
  return (
    <Image
      className={className}
      src={image.url}
      width={image.width}
      height={image.height}
      sizes={sizes}
      alt={restaurant.mainImage.altText}
      priority
    />
  );
}

export function RestaurantActions({
  restaurant,
  className,
  menuClassName,
  actionClassName,
}: Readonly<{
  restaurant: PublicRestaurant | null;
  className: string;
  menuClassName: string;
  actionClassName: string;
}>) {
  return (
    <div className={className}>
      <MenuLink className={menuClassName}>Browse the menu</MenuLink>
      {restaurant?.phone ? (
        <PhoneLink
          className={actionClassName}
          e164={restaurant.phone.e164}
          ariaLabel={`Call ${restaurant.phone.display}`}
        >
          Call {restaurant.phone.display}
        </PhoneLink>
      ) : null}
      {restaurant?.address ? (
        <a className={actionClassName} href={restaurant.address.directionsUrl} rel="noreferrer">Directions</a>
      ) : null}
    </div>
  );
}

export function MenuRestaurantActions({
  restaurant,
  className,
  actionClassName,
}: Readonly<{
  restaurant: PublicRestaurant | null;
  className: string;
  actionClassName: string;
}>) {
  if (!restaurant?.phone && !restaurant?.address) return null;
  return (
    <nav className={className} aria-label="Restaurant actions">
      {restaurant.phone ? (
        <PhoneLink
          className={actionClassName}
          e164={restaurant.phone.e164}
          ariaLabel={`Call ${restaurant.phone.display}`}
        >
          Call {restaurant.phone.display}
        </PhoneLink>
      ) : null}
      {restaurant.address ? (
        <a className={actionClassName} href={restaurant.address.directionsUrl} rel="noreferrer">Directions</a>
      ) : null}
    </nav>
  );
}

export function RestaurantContact({
  restaurant,
  className,
  linkClassName,
  headingId,
}: Readonly<{
  restaurant: PublicRestaurant;
  className: string;
  linkClassName: string;
  headingId: string;
}>) {
  if (!restaurant.address && !restaurant.email) return null;
  return (
    <section className={className} aria-labelledby={headingId}>
      <h2 id={headingId}>Visit</h2>
      {restaurant.address ? <address>{restaurant.address.formatted}</address> : null}
      {restaurant.email ? <a className={linkClassName} href={`mailto:${restaurant.email}`}>{restaurant.email}</a> : null}
    </section>
  );
}

export function RestaurantHours({
  restaurant,
  className,
  headingId,
}: Readonly<{ restaurant: PublicRestaurant; className: string; headingId: string }>) {
  return (
    <section className={className} aria-labelledby={headingId}>
      <h2 id={headingId}>Hours</h2>
      <dl>
        {restaurant.regularHours.map((day) => (
          <div key={day.dayOfWeek}>
            <dt>{days[day.dayOfWeek]}</dt>
            <dd>{formatIntervals(day.intervals)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function RestaurantSpecialHours({
  restaurant,
  className,
  headingId,
}: Readonly<{ restaurant: PublicRestaurant; className: string; headingId: string }>) {
  if (restaurant.specialHours.length === 0) return null;
  return (
    <section className={className} aria-labelledby={headingId}>
      <h2 id={headingId}>Special hours</h2>
      <ul>
        {restaurant.specialHours.map((day) => (
          <li key={day.date}>
            <strong>{day.date}</strong>: {day.isClosed ? "Closed" : formatIntervals(day.intervals)}
            {day.note ? ` — ${day.note}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RestaurantSocialLinks({
  restaurant,
  className,
}: Readonly<{ restaurant: PublicRestaurant; className: string }>) {
  if (restaurant.socialLinks.length === 0) return null;
  return (
    <nav className={className} aria-label="Social media">
      {restaurant.socialLinks.map((link) => (
        <a key={link.platform} href={link.url} rel="noreferrer">{humanize(link.platform)}</a>
      ))}
    </nav>
  );
}

export function DesignFooter({ className, restaurantName }: Readonly<{ className: string; restaurantName: string }>) {
  return <footer className={className}><p>{restaurantName}</p></footer>;
}

function formatIntervals(intervals: PublicRestaurant["regularHours"][number]["intervals"]): string {
  if (intervals.length === 0) return "Closed";
  return intervals.map((period) =>
    `${period.opensAt.slice(0, 5)}–${period.closesAt.slice(0, 5)}${period.closesNextDay ? " next day" : ""}`,
  ).join(", ");
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
