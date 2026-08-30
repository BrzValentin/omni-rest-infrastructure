import type { AdminMediaAsset, PublicationStatus } from "./restaurant-contract";

export type DishAvailability = "available" | "unavailable";

export type AdminDish = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: string;
  availability: DishAvailability;
  isActive: boolean;
  displayOrder: number;
  mediaAssetId: string | null;
  media: AdminMediaAsset | null;
  badges: string[];
  createdAt: string;
  updatedAt: string;
};

export type AdminMenuCategory = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  displayOrder: number;
  isActive: boolean;
  dishCount: number;
  dishes: AdminDish[];
  createdAt: string;
  updatedAt: string;
};

export type AdminMenu = {
  menuId: string | null;
  menuName: string | null;
  categories: AdminMenuCategory[];
  locale: string;
  currency: string;
  taxDisplayMode: "inclusive" | "exclusive";
  taxNoticeKey: string | null;
  availableBadges: string[];
  draftVersion: string;
  eTag: string;
  publicationStatus: PublicationStatus | null;
};

export type AdminMenuMutation = { menu: AdminMenu; publication: PublicationStatus };

export const categoryNameMaxLength = 100;
export const categoryDescriptionMaxLength = 300;
export const dishNameMaxLength = 160;
export const dishDescriptionMaxLength = 1000;

export const badgeLabels: Record<string, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  gluten_free: "Gluten-free",
  dairy_free: "Dairy-free",
  halal: "Halal",
  spicy: "Spicy",
  contains_nuts: "Contains nuts",
  popular: "Popular",
  new: "New",
};

export const availabilityLabels: Record<DishAvailability, string> = {
  available: "Available",
  unavailable: "Unavailable",
};

export const menuErrorMessages: Record<string, string> = {
  field_required: "This field is required.",
  field_length_invalid: "Use a valid value within the allowed length.",
  request_required: "The request was empty. Try again.",
  category_reorder_duplicate: "Each category can appear only once in the order.",
  category_reorder_incomplete: "The new order must include every category.",
  category_reorder_limit: "Too many categories to reorder at once.",
  category_id_invalid: "One of the categories is no longer valid. Reload and try again.",
  price_negative: "Enter zero or a positive price.",
  price_scale_invalid: "Use at most two decimal places, such as 12.50.",
  price_too_large: "That price is too large.",
  availability_invalid: "Choose Available or Unavailable.",
  badge_unknown: "One of the selected flags is not supported.",
  badge_duplicate: "Each flag can be selected only once.",
  badge_limit: "Too many flags selected.",
  dish_reorder_duplicate: "Each dish can appear only once in the order.",
  dish_reorder_incomplete: "The new order must include every dish in the category.",
  dish_reorder_limit: "Too many dishes to reorder at once.",
  dish_id_invalid: "One of the dishes is no longer valid. Reload and try again.",
};

export const menuProblemMessages: Record<string, string> = {
  category_contains_dishes: "Move or delete this category's dishes before deleting the category.",
  menu_category_not_found: "That category no longer exists. Reload to see the current menu.",
  dish_not_found: "That dish no longer exists. Reload to see the current menu.",
  media_asset_not_found: "That image no longer exists. Choose another one.",
  media_asset_not_ready: "That image is still processing. Try again shortly.",
  menu_not_found: "This restaurant has no active menu yet.",
  concurrency_conflict: "The menu changed elsewhere. Your entries are preserved; reload when you are ready to reapply them.",
  data_conflict: "The change conflicts with the current menu. Reload and try again.",
  csrf_invalid: "Your session needs refreshing. Reload the page and try again.",
};

/**
 * Moves one item within an ordered list and returns the resulting id order.
 */
export function moveCategory<T extends { id: string }>(items: T[], from: number, to: number): string[] {
  const ids = items.map((item) => item.id);
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved);
  return ids;
}

export const moveItem = moveCategory;

/**
 * Formats a canonical "0.00" price string for the restaurant's locale and currency,
 * falling back to the raw amount when the browser rejects the locale or currency.
 */
export function formatAdminPrice(price: string, locale: string, currency: string): string {
  const amount = Number(price);
  if (!Number.isFinite(amount)) return price;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${price} ${currency}`;
  }
}
