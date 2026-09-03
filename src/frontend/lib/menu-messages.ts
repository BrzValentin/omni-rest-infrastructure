const enCa = {
  menu: "Menu",
  home: "Home",
  skipToContent: "Skip to menu content",
  categories: "Menu categories",
  unavailable: "Unavailable",
  noMenuTitle: "Menu coming soon",
  noMenuBody: "This restaurant has not published a menu yet.",
  noCategoriesTitle: "No categories available",
  noCategoriesBody: "Please check back soon for the latest menu.",
  emptyCategory: "No dishes in this category.",
  unknownRestaurantTitle: "Restaurant not found",
  /** Only for an address that resolves to no restaurant at all — never for an ordinary missing page. */
  unknownRestaurantBody: "We could not find a public restaurant for this address.",
  notFoundTitle: "Page not found",
  /**
   * The copy for any unmatched path. The root 404 used to borrow `unknownRestaurantBody`, so a
   * mistyped page on a perfectly healthy restaurant claimed the restaurant itself did not exist.
   */
  notFoundBody: "We could not find the page you were looking for. It may have been moved, or the address may have a small mistake in it.",
  backToHome: "Go to the homepage",
  unavailableTitle: "This page is temporarily unavailable",
  unavailableBody: "We could not load this page just now. Please try again in a few minutes.",
  errorTitle: "We could not load the menu",
  pageErrorTitle: "We could not load this page",
  /** Shown wherever a restaurant name is genuinely unknown. Never a brand — no tenant is named here. */
  unnamedRestaurant: "Restaurant",
  errorBody: "Please try again. If the problem continues, check back a little later.",
  retry: "Try again",
  retrying: "Trying again…",
  loading: "Loading menu…",
  imageUnavailable: "Image unavailable",
  priceUnavailable: "Price unavailable",
  /**
   * Owner-portal states. "Unavailable" and "nothing here yet" are deliberately separate: every
   * portal page used to show the same dead end for both, so an owner could not tell an outage they
   * should wait out from a section they simply had not filled in.
   */
  adminUnavailableTitle: "This section is temporarily unavailable",
  adminUnavailableBody: "We could not reach your restaurant's information just now. Nothing you have saved is affected. Please try again in a few minutes.",
  adminEmptyTitle: "Nothing here yet",
  adminEmptyBody: "There is nothing set up in this section yet. Once it has been created, it will show up here.",
  adminRetry: "Try again",
  adminRetrying: "Trying again…",
  "admin.section.menu": "Menu editor",
  "admin.section.dishes": "Dish editor",
  "admin.section.restaurant": "Restaurant editor",
  "admin.section.gallery": "Gallery editor",
  "admin.section.design": "Design selection",
  "admin.section.preview": "Preview",
  "admin.section.designPreview": "Design preview",
  "admin.section.portal": "Owner portal",
  "admin.section.qrCode": "QR code",
  badgesDisclaimer: "Dietary and allergen badges are informational and do not replace speaking with the restaurant about your needs.",
  exclusiveTaxNotice: "Prices exclude applicable taxes.",
  "menu.badge.vegetarian": "Vegetarian",
  "menu.badge.vegan": "Vegan",
  "menu.badge.glutenFree": "Gluten-free",
  "menu.badge.dairyFree": "Dairy-free",
  "menu.badge.halal": "Halal",
  "menu.badge.spicy": "Spicy",
  "menu.badge.containsNuts": "Contains nuts",
  "menu.badge.popular": "Popular",
  "menu.badge.new": "New",
} as const;

export type MessageKey = keyof typeof enCa;

export function message(key: MessageKey | string): string {
  return key in enCa ? enCa[key as MessageKey] : key;
}
