import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicCategory } from "@/lib/menu-contract";
import { ordinaryMenu } from "@/test/fixtures";
import { DesignMenuBrowser } from "./shared/DesignMenuBrowser";
import { createDesignClassNames } from "./shared/designClassNames";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    for (const key of ["loader", "unoptimized", "sizes", "priority"]) {
      Reflect.deleteProperty(imageProps, key);
    }
    return React.createElement("img", imageProps);
  },
}));

const { formatPrice } = vi.hoisted(() => ({ formatPrice: vi.fn() }));
vi.mock("@/lib/format-price", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/format-price")>();
  formatPrice.mockImplementation(actual.formatPrice);
  return { formatPrice };
});

const classes = createDesignClassNames("quiet-elegance-v1");
const categories = ordinaryMenu.menu!.categories;

function renderBrowser(list: readonly PublicCategory[] = categories) {
  return render(
    <DesignMenuBrowser categories={list} locale="en-CA" currency="CAD" classes={classes} />,
  );
}

/** Switches category the way the nav link does, without going through scroll or motion preferences. */
function selectCategory(slug: string) {
  act(() => {
    window.history.pushState({ category: slug }, "", `#${slug}`);
    window.dispatchEvent(new Event("menu-selection"));
  });
}

function panelFor(slug: string) {
  const heading = document.getElementById(slug);
  const panel = heading?.closest("section");
  if (!panel) throw new Error(`Missing panel for ${slug}.`);
  return panel;
}

describe("DesignMenuBrowser", () => {
  afterEach(() => cleanup());

  it("shows the first category and hides the rest once hydrated", () => {
    renderBrowser();

    expect(panelFor("starters").hidden).toBe(false);
    expect(panelFor("desserts").hidden).toBe(true);
    expect(panelFor("soups").hidden).toBe(true);
  });

  it("switches panels on a hash selection without unmounting any dish", () => {
    renderBrowser();
    const before = screen.getAllByRole("heading", { level: 3, hidden: true }).length;

    selectCategory("soups");

    expect(panelFor("soups").hidden).toBe(false);
    expect(panelFor("starters").hidden).toBe(true);
    // Ruling 6: every dish stays in the markup for crawlers, selected or not.
    expect(screen.getAllByRole("heading", { level: 3, hidden: true })).toHaveLength(before);
    expect(screen.getByRole("heading", { level: 3, name: "Prairie Poutine", hidden: true }))
      .toBeInTheDocument();
  });

  it("does not re-render an unchanged dish when the category changes", () => {
    renderBrowser();
    expect(formatPrice).toHaveBeenCalled();
    const callsAfterMount = formatPrice.mock.calls.length;

    selectCategory("soups");
    selectCategory("desserts");
    selectCategory("starters");

    // `React.memo` on the dish card: the panels re-render, the 1,000-card subtree below them does not.
    expect(formatPrice.mock.calls.length).toBe(callsAfterMount);
  });

  it("clears a hash that names no published category", () => {
    renderBrowser();

    selectCategory("not-a-category");

    expect(window.location.hash).toBe("");
    expect(panelFor("starters").hidden).toBe(false);
  });

  it("maps only the badge codes the registry knows", () => {
    renderBrowser([
      {
        ...categories[0],
        dishes: [
          {
            ...categories[0].dishes[0],
            badges: [
              { code: "vegetarian", labelKey: "menu.badge.vegetarian", category: "dietary" },
              { code: "invented", labelKey: "menu.badge.invented", category: "dietary" },
              // A known code carrying the wrong label key is a contract mismatch, not a new badge.
              { code: "vegan", labelKey: "menu.badge.somethingElse", category: "dietary" },
            ],
          },
        ],
      },
    ]);

    const badges = screen.getByRole("list", { name: "Dish information" });
    expect([...badges.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["Vegetarian"]);
  });
});
