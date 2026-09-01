import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicRestaurant } from "@/lib/restaurant-contract";
import { galleryPhotos, ordinaryMenu, ordinaryRestaurant } from "@/test/fixtures";
import BroadsheetHome from "./broadsheet/BroadsheetHome";
import BroadsheetMenu from "./broadsheet/BroadsheetMenu";
import LegacyHome from "./legacy/LegacyHome";
import LegacyMenu from "./legacy/LegacyMenu";
import NightfallHome from "./nightfall/NightfallHome";
import NightfallMenu from "./nightfall/NightfallMenu";
import QuietEleganceHome from "./quiet-elegance/QuietEleganceHome";
import QuietEleganceMenu from "./quiet-elegance/QuietEleganceMenu";
import SunroomHome from "./sunroom/SunroomHome";
import SunroomMenu from "./sunroom/SunroomMenu";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    const priority = imageProps.priority === true;
    Reflect.deleteProperty(imageProps, "priority");
    Reflect.deleteProperty(imageProps, "sizes");
    Reflect.deleteProperty(imageProps, "loader");
    Reflect.deleteProperty(imageProps, "unoptimized");
    if (priority) imageProps.fetchPriority = "high";
    return React.createElement("img", imageProps);
  },
}));

const designs = [
  { id: "quiet-elegance-v1", Home: QuietEleganceHome, Menu: QuietEleganceMenu },
  { id: "nightfall-v1", Home: NightfallHome, Menu: NightfallMenu },
  { id: "broadsheet-v1", Home: BroadsheetHome, Menu: BroadsheetMenu },
  { id: "sunroom-v1", Home: SunroomHome, Menu: SunroomMenu },
] as const;
const allRenderers = [
  ...designs,
  { id: "legacy-current-v1", Home: LegacyHome, Menu: LegacyMenu },
] as const;
const galleryHeadingIds: Record<string, string> = {
  "quiet-elegance-v1": "quiet-gallery",
  "nightfall-v1": "night-gallery",
  "broadsheet-v1": "sheet-gallery",
  "sunroom-v1": "sun-gallery",
  "legacy-current-v1": "legacy-gallery",
};

/** An older publication snapshot predates the gallery field, so the property is missing rather than empty. */
function snapshotWithoutGallery(): PublicRestaurant {
  const restaurant = { ...ordinaryRestaurant };
  Reflect.deleteProperty(restaurant, "gallery");
  return restaurant as PublicRestaurant;
}

afterEach(() => cleanup());

describe("selectable website design renderers", () => {
  for (const design of designs) {
    it(`${design.id} preserves restaurant content and supported actions accessibly`, async () => {
      const { container } = render(<design.Home restaurant={ordinaryRestaurant} />);
      expect(container.firstElementChild).toHaveAttribute("data-website-design", design.id);
      expect(screen.getByRole("heading", { level: 1, name: ordinaryRestaurant.name })).toBeVisible();
      expect(screen.getByText(ordinaryRestaurant.shortDescription!)).toBeVisible();
      expect(screen.getByRole("link", { name: /Call/ })).toHaveAttribute("href", "tel:+12045550123");
      expect(screen.getByRole("link", { name: "Directions" })).toHaveAttribute(
        "href",
        ordinaryRestaurant.address?.directionsUrl,
      );
      expect(screen.getByRole("link", { name: "Browse the menu" })).toHaveAttribute("href", "/menu");
      expect(screen.getByRole("img", { name: "Dining room" })).toBeVisible();
      expect(screen.getByText(/2026-12-25/)).toBeVisible();
      expect(container.textContent).not.toMatch(/reservation|booking|shop|gift card|events/i);
      expect(container.textContent).not.toMatch(/OSSA|TAIGA/i);
      expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    });

    it(`${design.id} preserves menu categories, prices, availability, and badges accessibly`, async () => {
      const { container } = render(<design.Menu site={{ ...ordinaryMenu, websiteDesignId: design.id }} />);
      expect(container.firstElementChild).toHaveAttribute("data-website-design", design.id);
      expect(screen.getByRole("heading", { level: 1, name: ordinaryMenu.restaurantName })).toBeVisible();
      expect(screen.getByRole("heading", { name: "Starters" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Prairie Poutine" })).toBeInTheDocument();
      expect(screen.getByText("$12.50")).toBeInTheDocument();
      expect(screen.getByText("Vegetarian")).toBeInTheDocument();
      expect(screen.getByText("Contains nuts")).toBeInTheDocument();
      expect(screen.getByText("Unavailable")).toBeInTheDocument();
      expect(screen.getByText("No dishes in this category.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Call/ })).toHaveAttribute("href", "tel:+12045550123");
      expect(screen.getByRole("link", { name: "Directions" })).toHaveAttribute(
        "href",
        ordinaryRestaurant.address?.directionsUrl,
      );
      expect(container.textContent).not.toMatch(/reservation|booking|shop|gift card|events/i);
      expect(container.textContent).not.toMatch(/OSSA|TAIGA/i);
      expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    });
  }

  it("retains the legacy home and menu presentation for historical publications", () => {
    const { unmount } = render(<LegacyHome restaurant={ordinaryRestaurant} />);
    expect(screen.getByRole("heading", { level: 1, name: "Prairie Table" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Get directions" })).toHaveAttribute(
      "href",
      ordinaryRestaurant.address?.directionsUrl,
    );
    unmount();
    render(<LegacyMenu site={ordinaryMenu} />);
    expect(screen.getByRole("heading", { level: 3, name: "Prairie Poutine" })).toBeInTheDocument();
    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Call/ })).toHaveAttribute("href", "tel:+12045550123");
    expect(screen.getByRole("link", { name: "Directions" })).toHaveAttribute(
      "href",
      ordinaryRestaurant.address?.directionsUrl,
    );
  });

  it("prioritizes the legacy home hero image", () => {
    render(<LegacyHome restaurant={ordinaryRestaurant} />);

    const hero = screen.getByRole("img", { name: "Dining room" });
    expect(hero).toHaveAttribute("fetchpriority", "high");
    expect(hero).not.toHaveAttribute("loading", "lazy");
  });

  for (const design of allRenderers) {
    /**
     * Phase 6 published a `logo` that only ever reached the JSON-LD. PR-20 Task 6 requires branding to
     * be restaurant-specific on the page itself, so every design must show the tenant's own logo — and
     * must still render when a pre-Phase-6 snapshot carries `logo: null`.
     */
    it(`${design.id} brands the header with the restaurant's own logo`, () => {
      const withLogo = render(<design.Home restaurant={ordinaryRestaurant} />);
      const logo = withLogo.container.querySelector('img[src="/media/logo.webp"]');
      expect(logo).not.toBeNull();
      // Decorative: the restaurant name sits in the same link, so the logo must not repeat it.
      expect(logo).toHaveAttribute("alt", "");
      expect(withLogo.container.querySelector("header")).toContainElement(logo as HTMLElement);
      withLogo.unmount();

      const menuWithLogo = render(<design.Menu site={{ ...ordinaryMenu, websiteDesignId: design.id }} />);
      expect(menuWithLogo.container.querySelector('img[src="/media/logo.webp"]')).not.toBeNull();
      menuWithLogo.unmount();

      render(<design.Home restaurant={{ ...ordinaryRestaurant, logo: null }} />);
      expect(screen.getByRole("heading", { level: 1, name: ordinaryRestaurant.name })).toBeVisible();
      expect(document.querySelector('img[src="/media/logo.webp"]')).toBeNull();
    });

    it(`${design.id} renders the gallery section only when the snapshot carries photos`, () => {
      const withPhotos = render(<design.Home restaurant={ordinaryRestaurant} />);
      expect(screen.getByRole("heading", { level: 2, name: "Gallery" }))
        .toHaveAttribute("id", galleryHeadingIds[design.id]);
      const grid = screen.getByRole("list", { name: `${ordinaryRestaurant.name} photos` });
      expect(within(grid).getAllByRole("img").map((image) => image.getAttribute("src")))
        .toEqual(galleryPhotos.map((photo) => photo.thumbnailUrl));
      expect(within(grid).getByRole("button", { name: galleryPhotos[0].altText })).toBeVisible();
      withPhotos.unmount();

      const emptyGallery = render(<design.Home restaurant={{ ...ordinaryRestaurant, gallery: [] }} />);
      expect(screen.queryByRole("heading", { level: 2, name: "Gallery" })).toBeNull();
      expect(screen.queryByText("No photos available.")).toBeNull();
      expect(screen.getByRole("heading", { level: 1, name: ordinaryRestaurant.name })).toBeVisible();
      emptyGallery.unmount();

      render(<design.Home restaurant={snapshotWithoutGallery()} />);
      expect(screen.queryByRole("heading", { level: 2, name: "Gallery" })).toBeNull();
      expect(screen.queryByText("No photos available.")).toBeNull();
      expect(screen.getByRole("heading", { level: 1, name: ordinaryRestaurant.name })).toBeVisible();
    });

    it(`${design.id} handles missing restaurant, menu, and category content safely`, () => {
      const { container, unmount } = render(<design.Home restaurant={null} />);
      // A restaurant that could not be resolved is nameless, never the platform's own brand: on a
      // multi-tenant host that is a name belonging to no restaurant served there (PR-20 Task 6).
      expect(screen.getByRole("heading", { level: 1, name: "Restaurant" })).toBeVisible();
      expect(container.textContent).not.toMatch(/Omni/i);
      expect(container.querySelector("img")).toBeNull();
      expect(screen.queryByRole("link", { name: /Call/ })).not.toBeInTheDocument();
      unmount();

      const missingMenu = {
        ...ordinaryMenu,
        websiteDesignId: design.id,
        restaurant: null,
        taxDisplayMode: "inclusive" as const,
        menu: null,
      };
      const firstMenu = render(<design.Menu site={missingMenu} />);
      expect(screen.getByRole("heading", { name: "Menu coming soon" })).toBeVisible();
      expect(screen.queryByRole("link", { name: /Call/ })).not.toBeInTheDocument();
      expect(screen.queryByText("Prices exclude applicable taxes.")).not.toBeInTheDocument();
      firstMenu.unmount();

      render(<design.Menu site={{
        ...ordinaryMenu,
        websiteDesignId: design.id,
        menu: { ...ordinaryMenu.menu!, categories: [] },
      }} />);
      expect(screen.getByRole("heading", { name: "No categories available" })).toBeVisible();
    });
  }
});
