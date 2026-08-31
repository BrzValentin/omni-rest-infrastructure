import type { PublicCategory, PublicMenu } from "./menu-contract";
import type { PublicRestaurant } from "./restaurant-contract";
import { absoluteUrlFrom } from "./site-origin";

/**
 * Schema.org JSON-LD generation for the public site (PR-18).
 *
 * Two rules govern everything here:
 *
 *  1. **No empty properties.** PR-18 requires that a property is absent rather than present-and-empty.
 *     `prune` drops `null`, `undefined`, `""`, `[]`, and `{}` recursively, so every builder can assign
 *     optimistically and let one function enforce the rule.
 *  2. **Everything is built from the published projection.** Nothing here reads the draft, and nothing
 *     caches, so the structured data cannot drift from the page body it describes (README ruling 8).
 */

/** A JSON-LD node. Deliberately loose — Schema.org is open-world and shapes vary per node type. */
export type JsonLdNode = Record<string, unknown>;

const dayNames = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

/**
 * Serializes a payload for embedding in a `<script type="application/ld+json">`.
 *
 * `JSON.stringify` alone is unsafe here: restaurant and menu text is tenant-supplied and a literal
 * `</script>` inside it would terminate the element and turn the remainder into markup. Replacing `<`
 * with its unicode escape keeps the JSON semantically identical while making that impossible.
 */
export function serializeJsonLd(payload: JsonLdNode | readonly JsonLdNode[]): string {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

/** Recursively removes properties with no value, so no empty property is ever emitted. */
export function prune<T>(value: T): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim().length === 0 ? undefined : (value.trim() as T);
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((item) => item !== undefined);
    return items.length === 0 ? undefined : (items as T);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, prune(item)] as const)
      .filter(([, item]) => item !== undefined);
    // A node reduced to nothing but its @type carries no information and is dropped with the rest.
    if (entries.length === 0 || entries.every(([key]) => key === "@type")) return undefined;
    return Object.fromEntries(entries) as T;
  }
  return value;
}

/** The shape shared by restaurant images and dish media: whatever carries sized variants. */
type ImageLike = Readonly<{ variants: readonly Readonly<{ url: string; width: number }>[] }>;

/** Largest available variant, as an absolute URL. Images must be absolute for Schema.org consumers. */
function imageUrl(origin: string, image: ImageLike | null | undefined): string | undefined {
  const variant = image?.variants.reduce<ImageLike["variants"][number] | null>(
    (largest, item) => (!largest || item.width > largest.width ? item : largest),
    null,
  );
  if (!variant) return undefined;
  // Media URLs are same-origin relative paths in this platform, but the contract also permits an
  // allowlisted absolute HTTPS host, which must be passed through untouched.
  return variant.url.startsWith("/") ? absoluteUrlFrom(origin, variant.url) : variant.url;
}

/**
 * `OpeningHoursSpecification` entries for the whole week (PR-18 Task 4).
 *
 * Google's encoding rules, which differ from the obvious ones:
 *  - a day the restaurant is closed is `opens` and `closes` both `"00:00"`, not an omitted entry;
 *  - an overnight interval stays a *single* entry on its opening day, with `closes` wrapping past
 *    midnight — it is not split across two days;
 *  - multiple service periods on one day are separate entries for the same `dayOfWeek`.
 */
export function buildOpeningHours(restaurant: PublicRestaurant): JsonLdNode[] {
  return dayNames.flatMap((dayOfWeek, dayIndex) => {
    const intervals = restaurant.regularHours.find((day) => day.dayOfWeek === dayIndex)?.intervals ?? [];
    if (intervals.length === 0) {
      return [{ "@type": "OpeningHoursSpecification", dayOfWeek, opens: "00:00", closes: "00:00" }];
    }
    return intervals.map((interval) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek,
      opens: trimSeconds(interval.opensAt),
      closes: trimSeconds(interval.closesAt),
    }));
  });
}

/** The projection sends `HH:mm:ss`; Schema.org accepts it, but every Google example uses `HH:mm`. */
function trimSeconds(time: string): string {
  return /^\d{2}:\d{2}:00$/.test(time) ? time.slice(0, 5) : time;
}

/**
 * The `Restaurant` node for a tenant (PR-18 Tasks 2, 3, 5, 6, 7, 8).
 *
 * `@type` is the restaurant's configured Schema.org `FoodEstablishment` subtype — Google asks for the
 * most specific subtype available — and falls back to `Restaurant` when none is set.
 */
export function buildRestaurantSchema(
  origin: string,
  restaurant: PublicRestaurant,
  options: Readonly<{ hasPublishedMenu: boolean }>,
): JsonLdNode | undefined {
  const menuUrl = options.hasPublishedMenu ? absoluteUrlFrom(origin, "/menu") : undefined;
  const { latitude, longitude } = restaurant.address ?? { latitude: null, longitude: null };

  return prune({
    "@context": "https://schema.org",
    "@type": restaurant.restaurantType ?? "Restaurant",
    "@id": absoluteUrlFrom(origin, "/"),
    name: restaurant.name,
    description: restaurant.shortDescription,
    url: absoluteUrlFrom(origin, "/"),
    logo: imageUrl(origin, restaurant.logo),
    image: [imageUrl(origin, restaurant.coverImage), imageUrl(origin, restaurant.mainImage)],
    priceRange: restaurant.priceRange,
    telephone: restaurant.phone?.e164,
    email: restaurant.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: [restaurant.address?.streetLine1, restaurant.address?.streetLine2]
        .filter((part) => part && part.trim().length > 0).join(", "),
      addressLocality: restaurant.address?.city,
      addressRegion: restaurant.address?.region,
      postalCode: restaurant.address?.postalCode,
      addressCountry: restaurant.address?.countryCode,
    },
    geo: latitude === null || longitude === null
      ? undefined
      : { "@type": "GeoCoordinates", latitude, longitude },
    openingHoursSpecification: buildOpeningHours(restaurant),
    // `hasMenu` is the current property; `menu` is superseded by it but is what Google's LocalBusiness
    // documentation still names. Emitting both is valid and costs one duplicated URL.
    hasMenu: menuUrl,
    menu: menuUrl,
    sameAs: restaurant.socialLinks.map((link) => link.url),
  });
}

/** The `Menu` node, with each category as a section and each dish as a `MenuItem` (PR-19 Task 8). */
export function buildMenuSchema(
  origin: string,
  menu: PublicMenu,
  currency: string,
  restaurantName: string,
): JsonLdNode | undefined {
  return prune({
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": absoluteUrlFrom(origin, "/menu"),
    name: menu.name,
    url: absoluteUrlFrom(origin, "/menu"),
    hasMenuSection: menu.categories.map((category) => buildMenuSection(origin, category, currency)),
    provider: { "@type": "Restaurant", "@id": absoluteUrlFrom(origin, "/"), name: restaurantName },
  });
}

/** One category as a `MenuSection`. Used standalone by the category route and nested by the menu. */
export function buildMenuSection(
  origin: string,
  category: PublicCategory,
  currency: string,
): JsonLdNode | undefined {
  return prune({
    "@type": "MenuSection",
    "@id": absoluteUrlFrom(origin, `/menu/${category.slug}`),
    name: category.name,
    description: category.description,
    url: absoluteUrlFrom(origin, `/menu/${category.slug}`),
    hasMenuItem: category.dishes.map((dish) => ({
      "@type": "MenuItem",
      name: dish.name,
      description: dish.description,
      image: imageUrl(origin, dish.media),
      offers: {
        "@type": "Offer",
        price: dish.price,
        priceCurrency: currency,
        // An unavailable dish stays in the menu but is marked so, rather than being hidden from it.
        availability: dish.availability === "available"
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      },
    })),
  });
}
