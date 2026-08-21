import {
  resolveWebsiteDesignId,
  type PublicRestaurant,
  type WebsiteDesignId,
} from "./restaurant-contract";

export type TaxDisplayMode = "inclusive" | "exclusive";
export type Availability = "available" | "unavailable";
export type BadgeCategory = "dietary" | "allergen" | "promotional" | "heat";

export type PublicMediaVariant = Readonly<{
  url: string;
  width: number;
  height: number;
}>;

export type PublicMedia = Readonly<{
  altText: string;
  variants: readonly PublicMediaVariant[];
}>;

export type PublicBadge = Readonly<{
  code: string;
  labelKey: string;
  category: BadgeCategory;
}>;

export type PublicDish = Readonly<{
  id: string;
  name: string;
  description: string | null;
  price: string;
  availability: Availability;
  media: PublicMedia | null;
  badges: readonly PublicBadge[];
}>;

export type PublicCategory = Readonly<{
  id: string;
  slug: string;
  name: string;
  description: string | null;
  dishes: readonly PublicDish[];
}>;

export type PublicMenu = Readonly<{
  id: string;
  name: string;
  categories: readonly PublicCategory[];
}>;

export type PublicMenuResponse = Readonly<{
  restaurantId: string;
  restaurantName: string;
  locale: string;
  currency: string;
  taxDisplayMode: TaxDisplayMode;
  taxNoticeKey: string | null;
  publicationVersion: string;
  websiteDesignId: WebsiteDesignId;
  restaurant: PublicRestaurant | null;
  menu: PublicMenu | null;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const decimalPattern = /^(?:0|[1-9]\d*)\.\d{2}$/;
const versionPattern = /^(?:0|[1-9]\d*)$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const currencyPattern = /^[A-Z]{3}$/;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;
const badgeCategories = new Set<BadgeCategory>(["dietary", "allergen", "promotional", "heat"]);
const trustedRelativeMediaOrigin = new URL("https://same-origin.invalid/");

export class MenuContractError extends Error {
  constructor(path: string, expectation: string) {
    super(`Invalid public menu contract at ${path}: expected ${expectation}.`);
    this.name = "MenuContractError";
  }
}

export function parsePublicMenuResponse(
  value: unknown,
  allowedMediaHosts: ReadonlySet<string> = new Set(),
): PublicMenuResponse {
  const root = record(value, "$response");
  const restaurantId = uuid(root.restaurantId, "restaurantId");
  const restaurantName = nonblank(root.restaurantName, "restaurantName");
  const locale = validLocale(root.locale, "locale");
  const currency = string(root.currency, "currency");
  if (!currencyPattern.test(currency)) fail("currency", "ISO-4217 uppercase code");
  const taxDisplayMode = string(root.taxDisplayMode, "taxDisplayMode");
  if (taxDisplayMode !== "inclusive" && taxDisplayMode !== "exclusive") {
    fail("taxDisplayMode", "inclusive or exclusive");
  }
  const taxNoticeKey = nullableString(root.taxNoticeKey, "taxNoticeKey");
  const publicationVersion = string(root.publicationVersion, "publicationVersion");
  if (!versionPattern.test(publicationVersion)) fail("publicationVersion", "canonical decimal integer string");
  const websiteDesignId = resolveWebsiteDesignId(root.websiteDesignId);
  const restaurant = root.restaurant === undefined || root.restaurant === null
    ? null
    : parseRestaurant(root.restaurant, allowedMediaHosts);
  if (restaurant && restaurant.id !== restaurantId) {
    fail("restaurant.id", "match restaurantId");
  }
  if (restaurant && restaurant.name !== restaurantName) {
    fail("restaurant.name", "match restaurantName");
  }
  if (restaurant && restaurant.publicationVersion !== publicationVersion) {
    fail("restaurant.publicationVersion", "match publicationVersion");
  }
  if (restaurant && restaurant.websiteDesignId !== websiteDesignId) {
    fail("restaurant.websiteDesignId", "match websiteDesignId");
  }
  const menu = root.menu === null ? null : parseMenu(root.menu, allowedMediaHosts);

  return {
    restaurantId,
    restaurantName,
    locale,
    currency,
    taxDisplayMode,
    taxNoticeKey,
    publicationVersion,
    websiteDesignId,
    restaurant,
    menu,
  };
}

function parseRestaurant(
  value: unknown,
  allowedMediaHosts: ReadonlySet<string>,
): PublicRestaurant {
  const restaurant = record(value, "restaurant");
  return {
    id: uuid(restaurant.id, "restaurant.id"),
    name: nonblank(restaurant.name, "restaurant.name"),
    shortDescription: nullableString(restaurant.shortDescription, "restaurant.shortDescription"),
    phone: restaurant.phone === null
      ? null
      : parsePhone(restaurant.phone, "restaurant.phone"),
    email: nullableString(restaurant.email, "restaurant.email"),
    timeZone: nonblank(restaurant.timeZone, "restaurant.timeZone"),
    address: restaurant.address === null
      ? null
      : parseAddress(restaurant.address, "restaurant.address"),
    regularHours: array(restaurant.regularHours, "restaurant.regularHours").map((item, index) =>
      parseRegularHours(item, `restaurant.regularHours[${index}]`),
    ),
    specialHours: array(restaurant.specialHours, "restaurant.specialHours").map((item, index) =>
      parseSpecialHours(item, `restaurant.specialHours[${index}]`),
    ),
    status: parseRestaurantStatus(restaurant.status, "restaurant.status"),
    socialLinks: array(restaurant.socialLinks, "restaurant.socialLinks").map((item, index) =>
      parseSocialLink(item, `restaurant.socialLinks[${index}]`),
    ),
    mainImage: restaurant.mainImage === null
      ? null
      : parseRestaurantMainImage(restaurant.mainImage, allowedMediaHosts),
    publicationVersion: canonicalVersion(restaurant.publicationVersion, "restaurant.publicationVersion"),
    websiteDesignId: resolveWebsiteDesignId(restaurant.websiteDesignId),
  };
}

function parseRestaurantMainImage(
  value: unknown,
  allowedMediaHosts: ReadonlySet<string>,
): NonNullable<PublicRestaurant["mainImage"]> {
  const media = parseMedia(value, "restaurant.mainImage", allowedMediaHosts);
  return {
    altText: media.altText,
    variants: media.variants.map((variant) => ({ ...variant })),
  };
}

function parsePhone(value: unknown, path: string): NonNullable<PublicRestaurant["phone"]> {
  const phone = record(value, path);
  return {
    e164: nonblank(phone.e164, `${path}.e164`),
    display: nonblank(phone.display, `${path}.display`),
  };
}

function parseAddress(value: unknown, path: string): NonNullable<PublicRestaurant["address"]> {
  const address = record(value, path);
  const directionsUrl = nonblank(address.directionsUrl, `${path}.directionsUrl`);
  if (!safeHttpsUrl(directionsUrl)) fail(`${path}.directionsUrl`, "safe HTTPS URL");
  return {
    streetLine1: nonblank(address.streetLine1, `${path}.streetLine1`),
    streetLine2: nullableString(address.streetLine2, `${path}.streetLine2`),
    city: nonblank(address.city, `${path}.city`),
    region: nonblank(address.region, `${path}.region`),
    postalCode: nonblank(address.postalCode, `${path}.postalCode`),
    countryCode: nonblank(address.countryCode, `${path}.countryCode`),
    formatted: nonblank(address.formatted, `${path}.formatted`),
    directionsUrl,
  };
}

function parseRegularHours(value: unknown, path: string): PublicRestaurant["regularHours"][number] {
  const day = record(value, path);
  return {
    dayOfWeek: integerInRange(day.dayOfWeek, `${path}.dayOfWeek`, 0, 6),
    intervals: array(day.intervals, `${path}.intervals`).map((item, index) =>
      parseHourInterval(item, `${path}.intervals[${index}]`),
    ),
  };
}

function parseSpecialHours(value: unknown, path: string): PublicRestaurant["specialHours"][number] {
  const day = record(value, path);
  return {
    date: nonblank(day.date, `${path}.date`),
    isClosed: boolean(day.isClosed, `${path}.isClosed`),
    note: nullableString(day.note, `${path}.note`),
    intervals: array(day.intervals, `${path}.intervals`).map((item, index) =>
      parseHourInterval(item, `${path}.intervals[${index}]`),
    ),
  };
}

function parseHourInterval(
  value: unknown,
  path: string,
): PublicRestaurant["regularHours"][number]["intervals"][number] {
  const interval = record(value, path);
  return {
    opensAt: nonblank(interval.opensAt, `${path}.opensAt`),
    closesAt: nonblank(interval.closesAt, `${path}.closesAt`),
    closesNextDay: boolean(interval.closesNextDay, `${path}.closesNextDay`),
  };
}

function parseRestaurantStatus(value: unknown, path: string): PublicRestaurant["status"] {
  const status = record(value, path);
  return {
    state: nonblank(status.state, `${path}.state`),
    label: nonblank(status.label, `${path}.label`),
    nextChangeAt: nullableString(status.nextChangeAt, `${path}.nextChangeAt`),
    source: nonblank(status.source, `${path}.source`),
  };
}

function parseSocialLink(value: unknown, path: string): PublicRestaurant["socialLinks"][number] {
  const link = record(value, path);
  const url = nonblank(link.url, `${path}.url`);
  if (!safeHttpsUrl(url)) fail(`${path}.url`, "safe HTTPS URL");
  return {
    platform: nonblank(link.platform, `${path}.platform`),
    url,
  };
}

function parseMenu(value: unknown, allowedMediaHosts: ReadonlySet<string>): PublicMenu {
  const menu = record(value, "menu");
  return {
    id: uuid(menu.id, "menu.id"),
    name: nonblank(menu.name, "menu.name"),
    categories: array(menu.categories, "menu.categories").map((item, index) =>
      parseCategory(item, `menu.categories[${index}]`, allowedMediaHosts),
    ),
  };
}

function parseCategory(
  value: unknown,
  path: string,
  allowedMediaHosts: ReadonlySet<string>,
): PublicCategory {
  const category = record(value, path);
  const slug = string(category.slug, `${path}.slug`);
  if (!slugPattern.test(slug)) fail(`${path}.slug`, "stable lowercase URL slug");
  return {
    id: uuid(category.id, `${path}.id`),
    slug,
    name: nonblank(category.name, `${path}.name`),
    description: nullableString(category.description, `${path}.description`),
    dishes: array(category.dishes, `${path}.dishes`).map((item, index) =>
      parseDish(item, `${path}.dishes[${index}]`, allowedMediaHosts),
    ),
  };
}

function parseDish(value: unknown, path: string, allowedMediaHosts: ReadonlySet<string>): PublicDish {
  const dish = record(value, path);
  const price = string(dish.price, `${path}.price`);
  if (!decimalPattern.test(price)) fail(`${path}.price`, "nonnegative decimal string with exactly two fractional digits");
  const availability = string(dish.availability, `${path}.availability`);
  if (availability !== "available" && availability !== "unavailable") {
    fail(`${path}.availability`, "available or unavailable");
  }
  return {
    id: uuid(dish.id, `${path}.id`),
    name: nonblank(dish.name, `${path}.name`),
    description: nullableString(dish.description, `${path}.description`),
    price,
    availability,
    media: dish.media === null ? null : parseMedia(dish.media, `${path}.media`, allowedMediaHosts),
    badges: array(dish.badges, `${path}.badges`).map((item, index) =>
      parseBadge(item, `${path}.badges[${index}]`),
    ),
  };
}

function parseMedia(value: unknown, path: string, allowedMediaHosts: ReadonlySet<string>): PublicMedia {
  const media = record(value, path);
  return {
    altText: string(media.altText, `${path}.altText`),
    variants: array(media.variants, `${path}.variants`).map((item, index) => {
      const variantPath = `${path}.variants[${index}]`;
      const variant = record(item, variantPath);
      const url = string(variant.url, `${variantPath}.url`);
      if (!safeMediaUrl(url, allowedMediaHosts)) fail(`${variantPath}.url`, "safe relative or allowlisted HTTPS URL");
      const width = positiveInteger(variant.width, `${variantPath}.width`);
      const height = positiveInteger(variant.height, `${variantPath}.height`);
      return { url, width, height };
    }),
  };
}

function parseBadge(value: unknown, path: string): PublicBadge {
  const badge = record(value, path);
  const category = string(badge.category, `${path}.category`) as BadgeCategory;
  if (!badgeCategories.has(category)) fail(`${path}.category`, "known badge category");
  return {
    code: nonblank(badge.code, `${path}.code`),
    labelKey: nonblank(badge.labelKey, `${path}.labelKey`),
    category,
  };
}

function safeMediaUrl(value: string, allowedHosts: ReadonlySet<string>): boolean {
  if (!value || value.includes("\\") || controlCharacterPattern.test(value)) return false;

  if (value.startsWith("/")) {
    if (value.startsWith("//")) return false;
    try {
      return new URL(value, trustedRelativeMediaOrigin).origin === trustedRelativeMediaOrigin.origin;
    } catch {
      return false;
    }
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.port.length === 0 &&
      allowedHosts.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function safeHttpsUrl(value: string): boolean {
  if (controlCharacterPattern.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username.length === 0 && url.password.length === 0;
  } catch {
    return false;
  }
}

function validLocale(value: unknown, path: string): string {
  const candidate = string(value, path);
  try {
    return new Intl.Locale(candidate).toString();
  } catch {
    return fail(path, "BCP-47 locale");
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail(path, "object");
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, "array");
  return value;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string") return fail(path, "string");
  return value;
}

function nonblank(value: unknown, path: string): string {
  const candidate = string(value, path);
  if (candidate.trim().length === 0) return fail(path, "nonblank string");
  return candidate;
}

function nullableString(value: unknown, path: string): string | null {
  return value === null ? null : string(value, path);
}

function uuid(value: unknown, path: string): string {
  const candidate = string(value, path);
  if (!uuidPattern.test(candidate)) return fail(path, "UUID string");
  return candidate;
}

function positiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return fail(path, "positive integer");
  return value;
}

function integerInRange(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    return fail(path, `integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return fail(path, "boolean");
  return value;
}

function canonicalVersion(value: unknown, path: string): string {
  const version = string(value, path);
  if (!versionPattern.test(version)) return fail(path, "canonical decimal integer string");
  return version;
}

function fail(path: string, expectation: string): never {
  throw new MenuContractError(path, expectation);
}
