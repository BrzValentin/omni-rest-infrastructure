import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { ordinaryMenu } from "@/test/fixtures";

import { CategoryBrowser } from "./CategoryBrowser";

const categories = ordinaryMenu.menu!.categories;

describe("CategoryBrowser", () => {
  it("selects the first category, switches locally, and preserves an active empty category", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<CategoryBrowser categories={categories} currency="CAD" locale="en-CA" />);

    expect(screen.getByRole("heading", { name: "Starters" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Desserts", hidden: true })).not.toBeVisible();
    await user.click(screen.getByRole("link", { name: "Desserts" }));

    expect(window.location.hash).toBe("#desserts");
    expect(screen.getByRole("heading", { name: "Desserts" })).toBeVisible();
    expect(screen.getByText("No dishes in this category.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Starters", hidden: true })).not.toBeVisible();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves a valid deep link and normalizes an invalid fragment", async () => {
    window.history.replaceState(null, "", "/menu#soups");
    const { unmount } = render(<CategoryBrowser categories={categories} currency="CAD" locale="en-CA" />);
    expect(screen.getByRole("heading", { name: "Soups" })).toBeVisible();
    expect(screen.getByText("Unavailable")).toBeVisible();
    unmount();

    window.history.replaceState(null, "", "/menu#private-category");
    render(<CategoryBrowser categories={categories} currency="CAD" locale="en-CA" />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(screen.getByRole("heading", { name: "Starters" })).toBeVisible();
  });

  it("has no detectable axe violations in the enhanced selected state", async () => {
    const { container } = render(<CategoryBrowser categories={categories} currency="CAD" locale="en-CA" />);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
