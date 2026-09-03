export type HourInterval = { opensAt: string; closesAt: string; closesNextDay: boolean };
export const websiteDesignIds = {
  legacyCurrent: "legacy-current-v1",
  quietElegance: "quiet-elegance-v1",
  nightfall: "nightfall-v1",
  broadsheet: "broadsheet-v1",
  sunroom: "sunroom-v1",
} as const;
export type WebsiteDesignId = (typeof websiteDesignIds)[keyof typeof websiteDesignIds];
export type WebsiteDesignAvailability = "available" | "grandfathered";
const supportedWebsiteDesignIds = new Set<string>(Object.values(websiteDesignIds));

export function isWebsiteDesignId(value: unknown): value is WebsiteDesignId {
  return typeof value === "string" && supportedWebsiteDesignIds.has(value);
}

export function resolveWebsiteDesignId(value: unknown): WebsiteDesignId {
  return isWebsiteDesignId(value) ? value : websiteDesignIds.legacyCurrent;
}

export type Address = {
  line1: string; line2: string | null; city: string; region: string;
  postalCode: string; countryCode: string; latitude: number | null; longitude: number | null;
};
export type RegularHoursDay = { dayOfWeek: number; intervals: HourInterval[] };
export type SpecialHours = { id: string; date: string; isClosed: boolean; note: string | null; intervals: HourInterval[] };
export type SocialLink = { platform: string; url: string };
export type GalleryPhoto = Readonly<{
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  altText: string;
  caption: string | null;
  width: number;
  height: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
}>;
export type PublicGalleryResponse = {
  publicationVersion: string;
  images: readonly GalleryPhoto[];
};
export type MediaVariant = { url: string; width: number; height: number };
export type MainImage = { id: string; altText: string; processingStatus: string; variants: MediaVariant[] };
export type AdminMediaAsset = MainImage;
export type AdminWebsiteDesign = {
  id: WebsiteDesignId; name: string; contractVersion: string; availability: WebsiteDesignAvailability;
};
export type PublicationStatus = {
  operationId: string; status: string; draftVersion: string; attemptCount: number;
  errorCode: string | null; updatedAt: string;
};
export type AdminRestaurant = {
  id: string; name: string; description: string | null; phoneE164: string | null;
  phoneDisplay: string | null; email: string | null; timeZone: string; address: Address | null;
  regularHours: RegularHoursDay[]; specialHours: SpecialHours[]; socialLinks: SocialLink[];
  /** Phase 6 identity fields. Null until an owner sets them. */
  restaurantType: RestaurantType | null; priceRange: PriceRange | null;
  logo: MainImage | null; coverImage: MainImage | null;
  mainImage: MainImage | null; draftDesignId: WebsiteDesignId; publishedDesignId: WebsiteDesignId;
  websiteDesigns: AdminWebsiteDesign[]; draftVersion: string; eTag: string;
  publicationStatus: PublicationStatus | null;
  /**
   * The restaurant's own site. Optional in the type because a draft read from a backend older than
   * PR-24 simply omits the field; the server validates it as an absolute https URL of at most 2048
   * characters and reports `website_url_invalid` when it is neither.
   */
  websiteUrl?: string | null;
};
export type AdminMutation = { restaurant: AdminRestaurant; publication: PublicationStatus };
/**
 * Where this restaurant's public site actually lives, as the backend resolves it.
 *
 * The owner portal is not guaranteed to be served on the tenant's public host: owner endpoints bind
 * the tenant from the signed-in membership rather than from `Host`, so the portal may legitimately
 * run on a separate admin origin — the Playwright fixtures already do exactly that. This makes the
 * request-derived origin in `lib/seo.ts` the wrong answer for anything naming the *visitor-facing*
 * address, and most of all for a QR code, which is printed once and cannot be corrected afterwards.
 * Only the backend knows this value.
 *
 * `host` carries no scheme and no port; `lib/public-menu-url.ts` turns it into a URL. `source`
 * records which resolution strategy answered, and is `"none"` exactly when `host` is null.
 */
export type AdminPublicAddress = {
  host: string | null;
  source: "domain" | "slug" | "none";
};
/** A Schema.org `FoodEstablishment` subtype, used verbatim as the JSON-LD `@type`. */
export const restaurantTypes = [
  "Restaurant", "CafeOrCoffeeShop", "Bakery", "BarOrPub", "Brewery",
  "Distillery", "FastFoodRestaurant", "IceCreamShop", "Winery",
] as const;
export type RestaurantType = (typeof restaurantTypes)[number];
const supportedRestaurantTypes = new Set<string>(restaurantTypes);

export function isRestaurantType(value: unknown): value is RestaurantType {
  return typeof value === "string" && supportedRestaurantTypes.has(value);
}

export const priceRanges = ["$", "$$", "$$$", "$$$$"] as const;
export type PriceRange = (typeof priceRanges)[number];
const supportedPriceRanges = new Set<string>(priceRanges);

export function isPriceRange(value: unknown): value is PriceRange {
  return typeof value === "string" && supportedPriceRanges.has(value);
}

export type PublicImage = Omit<MainImage, "id" | "processingStatus">;

export type PublicRestaurant = {
  id: string; name: string; shortDescription: string | null;
  phone: { e164: string; display: string } | null; email: string | null; timeZone: string;
  address: ({ streetLine1: string; streetLine2: string | null; city: string; region: string;
    postalCode: string; countryCode: string; formatted: string; directionsUrl: string;
    /** Absent on snapshots published before Phase 6, and on addresses that were never geocoded. */
    latitude: number | null; longitude: number | null }) | null;
  regularHours: RegularHoursDay[]; specialHours: Omit<SpecialHours, "id">[];
  status: { state: string; label: string; nextChangeAt: string | null; source: string };
  socialLinks: SocialLink[]; mainImage: PublicImage | null;
  /** Published, active photos in display order. Older snapshots omit it — read it as `gallery ?? []`. */
  gallery: readonly GalleryPhoto[];
  /** Phase 6 identity fields. Absent on snapshots published before Phase 6, hence nullable. */
  restaurantType: RestaurantType | null; priceRange: PriceRange | null;
  logo: PublicImage | null; coverImage: PublicImage | null;
  /** Publication timestamp, ISO 8601. Sourced from the publication row, not the snapshot. */
  publishedAt: string | null;
  publicationVersion: string; websiteDesignId: WebsiteDesignId;
  /** The restaurant's own site, already validated as an absolute https URL. Absent on older snapshots. */
  websiteUrl?: string | null;
};

/**
 * The time zones a Canadian restaurant realistically sits in, with the names an owner recognises.
 *
 * The profile form used to take a free-text IANA identifier, which is a database key an owner has no
 * reason to know. The stored value is still that identifier — the backend validates it — but the
 * owner now picks a place rather than typing `America/Winnipeg` from memory.
 */
export const canadianTimeZones = [
  { id: "America/St_Johns", label: "Newfoundland — St. John's" },
  { id: "America/Halifax", label: "Atlantic — Halifax" },
  { id: "America/Toronto", label: "Eastern — Toronto" },
  { id: "America/Winnipeg", label: "Central — Winnipeg" },
  { id: "America/Regina", label: "Central, no daylight saving — Regina" },
  { id: "America/Edmonton", label: "Mountain — Edmonton" },
  { id: "America/Vancouver", label: "Pacific — Vancouver" },
  { id: "America/Whitehorse", label: "Yukon — Whitehorse" },
] as const;
