import type { PublicMenuResponse } from "@/lib/menu-contract";
import { websiteDesignIds, type PublicRestaurant } from "@/lib/restaurant-contract";

export const ordinaryRestaurant: PublicRestaurant = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Prairie Table",
  shortDescription: "Seasonal dishes from local ingredients.",
  phone: { e164: "+12045550123", display: "(204) 555-0123" },
  email: "hello@example.test",
  timeZone: "America/Winnipeg",
  address: {
    streetLine1: "1 Main Street",
    streetLine2: null,
    city: "Winnipeg",
    region: "MB",
    postalCode: "R3C 1A1",
    countryCode: "CA",
    formatted: "1 Main Street, Winnipeg, MB R3C 1A1",
    directionsUrl: "https://maps.example.test/directions",
  },
  regularHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    intervals: dayOfWeek === 0 ? [] : [
      { opensAt: "09:00:00", closesAt: "17:00:00", closesNextDay: false },
    ],
  })),
  specialHours: [
    { date: "2026-12-25", isClosed: true, note: "Holiday", intervals: [] },
  ],
  status: { state: "open", label: "Open now", nextChangeAt: null, source: "regularHours" },
  socialLinks: [{ platform: "instagram", url: "https://instagram.com/example" }],
  mainImage: {
    altText: "Dining room",
    variants: [{ url: "/media/restaurant.webp", width: 1200, height: 800 }],
  },
  publicationVersion: "1",
  websiteDesignId: websiteDesignIds.legacyCurrent,
};

export const ordinaryMenu: PublicMenuResponse = {
  restaurantId: "11111111-1111-4111-8111-111111111111",
  restaurantName: "Prairie Table",
  locale: "en-CA",
  currency: "CAD",
  taxDisplayMode: "exclusive",
  taxNoticeKey: "menu.tax.exclusive",
  publicationVersion: "1",
  websiteDesignId: websiteDesignIds.legacyCurrent,
  restaurant: ordinaryRestaurant,
  menu: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "All Day Menu",
    categories: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        slug: "starters",
        name: "Starters",
        description: "Small plates.",
        dishes: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Prairie Poutine",
            description: "Crisp potatoes with cheese curds.",
            price: "12.50",
            availability: "available",
            media: null,
            badges: [
              { code: "vegetarian", labelKey: "menu.badge.vegetarian", category: "dietary" },
              { code: "contains_nuts", labelKey: "menu.badge.containsNuts", category: "allergen" },
            ],
          },
        ],
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        slug: "desserts",
        name: "Desserts",
        description: null,
        dishes: [],
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        slug: "soups",
        name: "Soups",
        description: null,
        dishes: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            name: "Tomato Soup",
            description: null,
            price: "8.00",
            availability: "unavailable",
            media: {
              altText: "Tomato soup in a bowl",
              variants: [{ url: "/media/soup.webp", width: 640, height: 480 }],
            },
            badges: [{ code: "vegan", labelKey: "menu.badge.vegan", category: "dietary" }],
          },
        ],
      },
    ],
  },
};
