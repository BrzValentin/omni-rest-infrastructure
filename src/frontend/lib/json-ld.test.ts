import { describe, expect, it } from "vitest";

import {
  buildMenuSchema,
  buildMenuSection,
  buildOpeningHours,
  buildRestaurantSchema,
  prune,
  serializeJsonLd,
} from "./json-ld";
import type { PublicRestaurant } from "./restaurant-contract";
import { ordinaryMenu, ordinaryRestaurant } from "@/test/fixtures";

const origin = "https://menu.example.com";

function restaurantWith(overrides: Partial<PublicRestaurant>): PublicRestaurant {
  return { ...ordinaryRestaurant, ...overrides };
}

describe("serializeJsonLd", () => {
  it("escapes < so tenant text cannot close the script element", () => {
    const payload = { "@type": "Restaurant", name: "</script><img onerror=alert(1)>" };
    const serialized = serializeJsonLd(payload);

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c");
    // The escape is a JSON string escape, so the value round-trips unchanged.
    expect(JSON.parse(serialized)).toEqual(payload);
  });

  it("produces parseable JSON for ordinary content", () => {
    expect(JSON.parse(serializeJsonLd({ "@type": "Menu", name: "All Day" }))).toEqual({
      "@type": "Menu",
      name: "All Day",
    });
  });
});

describe("prune", () => {
  it("drops null, undefined, blank strings, empty arrays, and empty objects", () => {
    expect(prune({
      kept: "value",
      nothing: null,
      missing: undefined,
      blank: "   ",
      emptyList: [],
      emptyObject: {},
    })).toEqual({ kept: "value" });
  });

  it("prunes recursively and removes a parent left with nothing", () => {
    expect(prune({ outer: { inner: { deepest: null } }, kept: 1 })).toEqual({ kept: 1 });
  });

  it("drops a node that retains only its @type", () => {
    expect(prune({ address: { "@type": "PostalAddress", city: null }, name: "x" }))
      .toEqual({ name: "x" });
  });

  it("keeps falsy values that are real data", () => {
    expect(prune({ latitude: 0, flag: false })).toEqual({ latitude: 0, flag: false });
  });

  it("trims surrounding whitespace from retained strings", () => {
    expect(prune({ name: "  Prairie Table  " })).toEqual({ name: "Prairie Table" });
  });
});

describe("buildOpeningHours", () => {
  it("emits an entry for every day of the week", () => {
    expect(buildOpeningHours(ordinaryRestaurant)).toHaveLength(7);
  });

  it("marks a closed day with 00:00 to 00:00 rather than omitting it", () => {
    // The fixture closes on Sunday (dayOfWeek 0).
    const sunday = buildOpeningHours(ordinaryRestaurant)[0];
    expect(sunday).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Sunday",
      opens: "00:00",
      closes: "00:00",
    });
  });

  it("trims the seconds component the projection sends", () => {
    expect(buildOpeningHours(ordinaryRestaurant)[1]).toMatchObject({
      dayOfWeek: "Monday",
      opens: "09:00",
      closes: "17:00",
    });
  });

  it("emits one entry per service period on a split day", () => {
    const restaurant = restaurantWith({
      regularHours: [
        {
          dayOfWeek: 1,
          intervals: [
            { opensAt: "11:00:00", closesAt: "14:30:00", closesNextDay: false },
            { opensAt: "17:00:00", closesAt: "22:00:00", closesNextDay: false },
          ],
        },
      ],
    });
    const monday = buildOpeningHours(restaurant).filter((entry) => entry.dayOfWeek === "Monday");

    expect(monday).toHaveLength(2);
    expect(monday.map((entry) => entry.opens)).toEqual(["11:00", "17:00"]);
  });

  it("keeps an overnight interval as one entry on its opening day", () => {
    const restaurant = restaurantWith({
      regularHours: [
        { dayOfWeek: 6, intervals: [{ opensAt: "18:00:00", closesAt: "03:00:00", closesNextDay: true }] },
      ],
    });
    const saturday = buildOpeningHours(restaurant).filter((entry) => entry.dayOfWeek === "Saturday");

    expect(saturday).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Saturday", opens: "18:00", closes: "03:00" },
    ]);
  });
});

describe("buildRestaurantSchema", () => {
  const complete = buildRestaurantSchema(origin, ordinaryRestaurant, { hasPublishedMenu: true })!;

  it("uses the configured Schema.org subtype and absolute URLs", () => {
    expect(complete["@type"]).toBe("Restaurant");
    expect(complete.url).toBe("https://menu.example.com/");
    expect(complete.logo).toBe("https://menu.example.com/media/logo.webp");
  });

  it("uses a more specific FoodEstablishment subtype when one is configured", () => {
    const cafe = buildRestaurantSchema(
      origin,
      restaurantWith({ restaurantType: "CafeOrCoffeeShop" }),
      { hasPublishedMenu: true },
    )!;
    expect(cafe["@type"]).toBe("CafeOrCoffeeShop");
  });

  it("falls back to Restaurant when no type is configured", () => {
    const untyped = buildRestaurantSchema(origin, restaurantWith({ restaurantType: null }), {
      hasPublishedMenu: true,
    })!;
    expect(untyped["@type"]).toBe("Restaurant");
  });

  it("builds a PostalAddress from the projection", () => {
    expect(complete.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "1 Main Street",
      addressLocality: "Winnipeg",
      addressRegion: "MB",
      postalCode: "R3C 1A1",
      addressCountry: "CA",
    });
  });

  it("joins a second address line into streetAddress", () => {
    const suite = buildRestaurantSchema(
      origin,
      restaurantWith({ address: { ...ordinaryRestaurant.address!, streetLine2: "Suite 5" } }),
      { hasPublishedMenu: true },
    )!;
    expect((suite.address as Record<string, unknown>).streetAddress).toBe("1 Main Street, Suite 5");
  });

  it("emits geo coordinates when both axes are present", () => {
    expect(complete.geo).toEqual({ "@type": "GeoCoordinates", latitude: 49.8951, longitude: -97.1384 });
  });

  it("omits geo entirely when coordinates are absent", () => {
    const ungeocoded = buildRestaurantSchema(
      origin,
      restaurantWith({ address: { ...ordinaryRestaurant.address!, latitude: null, longitude: null } }),
      { hasPublishedMenu: true },
    )!;
    expect(ungeocoded).not.toHaveProperty("geo");
  });

  it("emits both hasMenu and menu when a menu is published", () => {
    expect(complete.hasMenu).toBe("https://menu.example.com/menu");
    expect(complete.menu).toBe("https://menu.example.com/menu");
  });

  it("omits the menu properties when no menu is published", () => {
    const noMenu = buildRestaurantSchema(origin, ordinaryRestaurant, { hasPublishedMenu: false })!;
    expect(noMenu).not.toHaveProperty("hasMenu");
    expect(noMenu).not.toHaveProperty("menu");
  });

  it("emits configured social links as sameAs and omits the property when there are none", () => {
    expect(complete.sameAs).toEqual(["https://instagram.com/example"]);
    const unsocial = buildRestaurantSchema(origin, restaurantWith({ socialLinks: [] }), {
      hasPublishedMenu: true,
    })!;
    expect(unsocial).not.toHaveProperty("sameAs");
  });

  it("omits every optional property for a minimally configured restaurant", () => {
    const minimal = buildRestaurantSchema(
      origin,
      restaurantWith({
        shortDescription: null, phone: null, email: null, address: null, socialLinks: [],
        mainImage: null, logo: null, coverImage: null, restaurantType: null, priceRange: null,
      }),
      { hasPublishedMenu: false },
    )!;

    for (const absent of [
      "description", "telephone", "email", "address", "geo", "sameAs",
      "logo", "image", "priceRange", "hasMenu", "menu",
    ]) {
      expect(minimal).not.toHaveProperty(absent);
    }
    // Identity and the full week of hours survive, because they are always known.
    expect(minimal.name).toBe("Prairie Table");
    expect(minimal.url).toBe("https://menu.example.com/");
    expect(minimal.openingHoursSpecification).toHaveLength(7);
  });

  it("never emits a property whose value is null, empty, or blank", () => {
    const values = JSON.stringify(complete);
    expect(values).not.toContain(":null");
    expect(values).not.toContain(':""');
    expect(values).not.toContain(":[]");
    expect(values).not.toContain(":{}");
  });
});

describe("buildMenuSchema", () => {
  const menu = buildMenuSchema(origin, ordinaryMenu.menu!, ordinaryMenu.currency, "Prairie Table")!;

  it("describes the menu with an absolute URL and a section per category", () => {
    expect(menu["@type"]).toBe("Menu");
    expect(menu.url).toBe("https://menu.example.com/menu");
    expect(menu.hasMenuSection).toHaveLength(ordinaryMenu.menu!.categories.length);
  });

  it("links each section to its own category page", () => {
    const [first] = menu.hasMenuSection as Record<string, unknown>[];
    expect(first.url).toBe(`https://menu.example.com/menu/${ordinaryMenu.menu!.categories[0].slug}`);
  });
});

describe("buildMenuSection", () => {
  const category = ordinaryMenu.menu!.categories[0];
  const section = buildMenuSection(origin, category, "CAD")!;

  it("emits a MenuItem per dish with a priced offer", () => {
    const items = section.hasMenuItem as Record<string, unknown>[];
    expect(items).toHaveLength(category.dishes.length);
    expect(items[0]).toMatchObject({
      "@type": "MenuItem",
      name: category.dishes[0].name,
      offers: { "@type": "Offer", price: category.dishes[0].price, priceCurrency: "CAD" },
    });
  });

  it("marks an unavailable dish OutOfStock rather than dropping it", () => {
    const unavailable = buildMenuSection(
      origin,
      {
        ...category,
        dishes: [{ ...category.dishes[0], availability: "unavailable" }],
      },
      "CAD",
    )!;
    const [item] = unavailable.hasMenuItem as Record<string, unknown>[];
    expect((item.offers as Record<string, unknown>).availability).toBe("https://schema.org/OutOfStock");
  });

  it("omits hasMenuItem for a category with no dishes", () => {
    expect(buildMenuSection(origin, { ...category, dishes: [] }, "CAD"))
      .not.toHaveProperty("hasMenuItem");
  });
});
