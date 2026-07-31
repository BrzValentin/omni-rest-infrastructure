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
  const menu = root.menu === null ? null : parseMenu(root.menu, allowedMediaHosts);

  return {
    restaurantId,
    restaurantName,
    locale,
    currency,
    taxDisplayMode,
    taxNoticeKey,
    publicationVersion,
    menu,
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

function fail(path: string, expectation: string): never {
  throw new MenuContractError(path, expectation);
}
