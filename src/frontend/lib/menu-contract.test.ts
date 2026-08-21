import { describe, expect, it } from "vitest";

import { ordinaryMenu } from "@/test/fixtures";

import { MenuContractError, parsePublicMenuResponse } from "./menu-contract";

describe("parsePublicMenuResponse", () => {
  it("accepts the frozen precision-safe contract", () => {
    expect(parsePublicMenuResponse(structuredClone(ordinaryMenu))).toEqual(ordinaryMenu);
  });

  it("retains the nested restaurant projection and rejects cross-snapshot identity drift", () => {
    expect(parsePublicMenuResponse(structuredClone(ordinaryMenu)).restaurant)
      .toEqual(ordinaryMenu.restaurant);
    expect(() => parsePublicMenuResponse({
      ...ordinaryMenu,
      restaurant: { ...ordinaryMenu.restaurant!, publicationVersion: "2" },
    })).toThrow(/restaurant\.publicationVersion/);
  });

  it("rejects decimal numbers, unsafe media, and malformed ownership identifiers", () => {
    const numericPrice = structuredClone(ordinaryMenu) as unknown as Record<string, unknown>;
    const menu = numericPrice.menu as { categories: { dishes: { price: unknown }[] }[] };
    menu.categories[0]!.dishes[0]!.price = 12.5;
    expect(() => parsePublicMenuResponse(numericPrice)).toThrow(MenuContractError);

    const unsafeMedia = structuredClone(ordinaryMenu);
    const unsafeVariant = unsafeMedia as unknown as {
      menu: { categories: { dishes: { media: { variants: { url: string }[] } | null }[] }[] };
    };
    unsafeVariant.menu.categories[2]!.dishes[0]!.media!.variants[0]!.url = "https://evil.example/soup.webp";
    expect(() => parsePublicMenuResponse(unsafeMedia)).toThrow(/safe relative or allowlisted HTTPS URL/);

    expect(() => parsePublicMenuResponse({ ...ordinaryMenu, restaurantId: "not-a-uuid" })).toThrow(/UUID/);
  });

  it("allows explicitly allowlisted HTTPS media", () => {
    const remote = withMediaUrl("https://images.example.test/soup.webp");
    expect(parsePublicMenuResponse(remote, new Set(["images.example.test"]))).toEqual(remote);
  });

  it("falls back to the supported legacy renderer for missing and unknown historical IDs", () => {
    const missing = structuredClone(ordinaryMenu) as unknown as Record<string, unknown>;
    delete missing.websiteDesignId;
    expect(parsePublicMenuResponse(missing).websiteDesignId).toBe("legacy-current-v1");
    expect(parsePublicMenuResponse({ ...ordinaryMenu, websiteDesignId: "retired-theme-v0" }).websiteDesignId)
      .toBe("legacy-current-v1");
  });

  it("keeps historical menu snapshots without a nested restaurant safe", () => {
    const historical = structuredClone(ordinaryMenu) as unknown as Record<string, unknown>;
    delete historical.restaurant;
    expect(parsePublicMenuResponse(historical).restaurant).toBeNull();
  });

  it.each([
    "quiet-elegance-v1",
    "nightfall-v1",
    "broadsheet-v1",
    "sunroom-v1",
  ] as const)("preserves supported design ID %s", (websiteDesignId) => {
    expect(parsePublicMenuResponse({
      ...ordinaryMenu,
      websiteDesignId,
      restaurant: { ...ordinaryMenu.restaurant!, websiteDesignId },
    }).websiteDesignId)
      .toBe(websiteDesignId);
  });

  it.each([
    "/\\evil.example/x",
    "\\evil.example/x",
    "\\\\evil.example/x",
    "https:\\evil.example/x",
    "///evil.example/x",
    "https://user@images.example.test/x",
    "https://images.example.test:444/x",
  ])("rejects authority-changing media URL %s", (url) => {
    expect(() => parsePublicMenuResponse(withMediaUrl(url), new Set(["images.example.test"]))).toThrow(
      /safe relative or allowlisted HTTPS URL/,
    );
  });
});

function withMediaUrl(url: string) {
  const response = structuredClone(ordinaryMenu);
  const typed = response as unknown as {
    menu: { categories: { dishes: { media: { variants: { url: string }[] } | null }[] }[] };
  };
  typed.menu.categories[2]!.dishes[0]!.media!.variants[0]!.url = url;
  return response;
}
