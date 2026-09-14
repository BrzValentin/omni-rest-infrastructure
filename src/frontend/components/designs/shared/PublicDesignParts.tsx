import Image from "next/image";
import Link from "next/link";

import { MenuLink } from "@/components/MenuLink";
import { PhoneLink } from "@/components/phone/PhoneLink";
import { brandLogoVariant } from "@/lib/brand";
import { formatInterval } from "@/lib/format-time";
import { mapEmbedUrl } from "@/lib/map-embed";
import type { PublicImage, PublicRestaurant } from "@/lib/restaurant-contract";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function DesignSkipLink({ className }: Readonly<{ className: string }>) {
  return <a className={className} href="#main-content">Skip to content</a>;
}

/**
 * The brand link every design puts in its header.
 *
 * The published logo is rendered here rather than in each design so all five pick it up from one
 * place, keeping branding restaurant-specific (PR-20 Task 6) without touching any design's visual
 * character — each supplies its own class for the mark. The logo is decorative: the restaurant name
 * sits beside it in the same link, so a second announcement of the same name would only add noise.
 * Snapshots published before Phase 6 carry `logo: null` and simply render the name alone.
 */
export function HomeLink({
  className,
  restaurantName,
  logo,
  logoClassName,
}: Readonly<{
  className: string;
  restaurantName: string;
  logo?: PublicImage | null;
  logoClassName?: string;
}>) {
  const variant = brandLogoVariant(logo);
  return (
    <Link className={className} href="/" prefetch={false} aria-label={`${restaurantName} home`}>
      {variant ? (
        <Image
          className={logoClassName}
          src={variant.url}
          width={variant.width}
          height={variant.height}
          sizes="3rem"
          alt=""
        />
      ) : null}
      <span>{restaurantName}</span>
    </Link>
  );
}

export { PrimaryNavigationLink } from "@/components/PrimaryNavigationLink";

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

/**
 * The "About Us" section (PR-1 Task 1.1, BUG-001), from the owner's own About text.
 *
 * Deliberately a separate field from the 300-character description the hero shows: rendering that same
 * sentence twice on one page is what an About section built from existing data would have looked like.
 * Hidden entirely when the owner has written nothing, like every other optional section (Task 2.9).
 *
 * Blank lines in the text become paragraphs. Nothing else is interpreted — no markdown, no HTML — so an
 * owner cannot break the page and nothing they type is ever rendered as markup.
 */
export function RestaurantAbout({
  restaurant,
  className,
  headingId,
}: Readonly<{ restaurant: PublicRestaurant; className?: string; headingId: string }>) {
  const paragraphs = (restaurant.about ?? "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  if (paragraphs.length === 0) return null;
  return (
    <section className={className} aria-labelledby={headingId}>
      <h2 id={headingId}>About Us</h2>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </section>
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
      <RestaurantMap restaurant={restaurant} />
    </section>
  );
}

/**
 * The location map (PR-2 Tasks 2.9 and 2.10, BUG-003). Renders nothing without coordinates, which is
 * exactly what Task 2.10 asks for: the address above it still shows on its own.
 *
 * Deliberately plain server markup — an `<iframe>`, no Maps JavaScript API — so no design markup and
 * no map library reaches the client bundle (`scripts/assert-design-assets.mjs`), and the browser does
 * no map work until the frame nears the viewport.
 *
 * Sized with inline styles rather than a design stylesheet class. The five stylesheets are served
 * `immutable` for a year under a fixed filename, so a new rule there would never reach a returning
 * visitor. The reserved `aspect-ratio` keeps the lazily loaded frame from shifting the page (the
 * Phase 8 CLS budget on `/` is a hard gate).
 */
export function RestaurantMap({ restaurant }: Readonly<{ restaurant: PublicRestaurant }>) {
  const src = mapEmbedUrl(restaurant.address, process.env.GOOGLE_MAPS_EMBED_API_KEY);
  if (!src) return null;
  return (
    <iframe
      title={`Map showing the location of ${restaurant.name}`}
      src={src}
      loading="lazy"
      // Not `no-referrer`: a referrer-restricted Embed API key is checked against this header, and
      // the map would refuse to load without it. The origin alone is all the key restriction needs.
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ display: "block", width: "100%", maxWidth: "100%", aspectRatio: "4 / 3", border: 0 }}
    />
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
  // 12-hour display (BUG-005). Stored and API values stay 24-hour `HH:mm:ss`.
  return intervals.map(formatInterval).join(", ");
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
