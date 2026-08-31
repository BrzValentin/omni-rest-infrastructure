import type { PublicMenuResponse } from "@/lib/menu-contract";
import { websiteDesignIds, type GalleryPhoto, type PublicRestaurant } from "@/lib/restaurant-contract";

export const galleryPhotos: readonly GalleryPhoto[] = [
  {
    id: "88888888-8888-4888-8888-888888888881",
    imageUrl: "/media/gallery/patio.webp",
    thumbnailUrl: "/media/gallery/patio-thumb.webp",
    altText: "Sunny patio seating",
    caption: "Patio seating opens in May.",
    width: 1600,
    height: 1067,
    thumbnailWidth: 480,
    thumbnailHeight: 320,
  },
  {
    id: "88888888-8888-4888-8888-888888888882",
    imageUrl: "/media/gallery/counter.webp",
    thumbnailUrl: "/media/gallery/counter-thumb.webp",
    altText: "Chef plating at the counter",
    caption: null,
    width: 1400,
    height: 1400,
    thumbnailWidth: 480,
    thumbnailHeight: 480,
  },
  {
    id: "88888888-8888-4888-8888-888888888883",
    imageUrl: "/media/gallery/room.webp",
    thumbnailUrl: "/media/gallery/room-thumb.webp",
    altText: "Dining room at dusk",
    caption: "The dining room at dusk.",
    width: 1200,
    height: 900,
    thumbnailWidth: 400,
    thumbnailHeight: 300,
  },
];

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
    latitude: 49.8951,
    longitude: -97.1384,
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
  gallery: galleryPhotos,
  restaurantType: "Restaurant",
  priceRange: "$$",
  logo: { altText: "Prairie Table logo", variants: [{ url: "/media/logo.webp", width: 512, height: 512 }] },
  coverImage: { altText: "Patio at dusk", variants: [{ url: "/media/cover.webp", width: 1600, height: 900 }] },
  publishedAt: "2026-08-30T12:00:00.000Z",
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
  publishedAt: "2026-08-30T12:00:00.000Z",
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
