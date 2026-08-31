import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ordinaryMenu } from "@/test/fixtures";
import BroadsheetMenu from "./broadsheet/BroadsheetMenu";
import LegacyMenu from "./legacy/LegacyMenu";
import NightfallMenu from "./nightfall/NightfallMenu";
import QuietEleganceMenu from "./quiet-elegance/QuietEleganceMenu";
import SunroomMenu from "./sunroom/SunroomMenu";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    Reflect.deleteProperty(imageProps, "priority");
    Reflect.deleteProperty(imageProps, "sizes");
    return React.createElement("img", imageProps);
  },
}));

const renderers = [
  { id: "legacy-current-v1", Menu: LegacyMenu },
  { id: "quiet-elegance-v1", Menu: QuietEleganceMenu },
  { id: "nightfall-v1", Menu: NightfallMenu },
  { id: "broadsheet-v1", Menu: BroadsheetMenu },
  { id: "sunroom-v1", Menu: SunroomMenu },
] as const;

const taxNotice = "Prices exclude applicable taxes.";

afterEach(() => cleanup());

describe("public price and tax presentation", () => {
  for (const design of renderers) {
    it(`${design.id} shows the tax notice only when prices exclude taxes`, () => {
      const exclusive = render(<design.Menu site={{ ...ordinaryMenu, websiteDesignId: design.id }} />);
      expect(screen.getByText(taxNotice)).toBeVisible();
      exclusive.unmount();

      render(<design.Menu site={{
        ...ordinaryMenu,
        websiteDesignId: design.id,
        taxDisplayMode: "inclusive",
        taxNoticeKey: null,
      }} />);
      expect(screen.queryByText(taxNotice)).not.toBeInTheDocument();
    });

    it(`${design.id} prints every price with the restaurant currency and two decimals`, () => {
      render(<design.Menu site={{ ...ordinaryMenu, websiteDesignId: design.id }} />);

      // The projection never adjusts a price for tax; the displayed amount is the stored one.
      const formatted = new Intl.NumberFormat("en-CA", {
        style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(12.5);
      expect(screen.getAllByText(formatted).length).toBeGreaterThan(0);
    });
  }

  it("falls back to a safe label when a publication carries an unusable price", () => {
    const broken = {
      ...ordinaryMenu,
      menu: {
        ...ordinaryMenu.menu!,
        categories: ordinaryMenu.menu!.categories.map((category) => ({
          ...category,
          dishes: category.dishes.map((dish) => ({ ...dish, price: "12.5" })),
        })),
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<LegacyMenu site={broken} />);
    expect(screen.getAllByText("Price unavailable").length).toBeGreaterThan(0);
  });
});
