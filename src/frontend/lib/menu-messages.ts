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
  unknownRestaurantBody: "We could not find a public restaurant for this address.",
  errorTitle: "We could not load the menu",
  errorBody: "Please try again. If the problem continues, check back a little later.",
  retry: "Try again",
  retrying: "Trying again…",
  loading: "Loading menu…",
  imageUnavailable: "Image unavailable",
  priceUnavailable: "Price unavailable",
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
