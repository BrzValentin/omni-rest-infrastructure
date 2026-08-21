import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ordinaryMenu, ordinaryRestaurant } from "@/test/fixtures";
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
    it(`${design.id} handles missing restaurant, menu, and category content safely`, () => {
      const { unmount } = render(<design.Home restaurant={null} />);
      expect(screen.getByRole("heading", { level: 1, name: "Omni REST" })).toBeVisible();
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
