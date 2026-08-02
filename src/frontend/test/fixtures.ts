import type { PublicMenuResponse } from "@/lib/menu-contract";

export const ordinaryMenu: PublicMenuResponse = {
  restaurantId: "11111111-1111-4111-8111-111111111111",
  restaurantName: "Prairie Table",
  locale: "en-CA",
  currency: "CAD",
  taxDisplayMode: "exclusive",
  taxNoticeKey: "menu.tax.exclusive",
  publicationVersion: "1",
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
