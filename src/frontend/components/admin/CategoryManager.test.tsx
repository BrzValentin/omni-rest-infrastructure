import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserApiError } from "@/lib/browser-api";
import { moveCategory, type AdminMenu, type AdminMenuCategory, type AdminMenuMutation } from "@/lib/menu-admin-contract";
import { CategoryManager } from "./CategoryManager";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/browser-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/browser-api")>(),
  mutate: mocks.mutate,
}));

function category(id: string, name: string, displayOrder: number, dishCount = 0): AdminMenuCategory {
  return {
    id, name, description: null, slug: name.toLowerCase(), displayOrder, isActive: true, dishCount, dishes: [],
    createdAt: "2026-07-31T12:00:00Z", updatedAt: "2026-07-31T12:00:00Z",
  };
}

const initial: AdminMenu = {
  menuId: "menu-1",
  menuName: "All Day Menu",
  categories: [category("a", "Starters", 0, 2), category("b", "Mains", 1, 1), category("c", "Desserts", 2)],
  locale: "en-CA",
  currency: "CAD",
  taxDisplayMode: "exclusive",
  taxNoticeKey: "menu.tax.exclusive",
  availableBadges: ["vegan", "vegetarian"],
  draftVersion: "4",
  eTag: '"draft-4"',
  publicationStatus: { operationId: "op", status: "succeeded", draftVersion: "4", attemptCount: 1, errorCode: null, updatedAt: "2026-07-31T12:00:00Z" },
};

function mutationWith(categories: AdminMenuCategory[]): AdminMenuMutation {
  return {
    menu: { ...initial, categories, draftVersion: "5", eTag: '"draft-5"' },
    publication: { operationId: "op2", status: "succeeded", draftVersion: "5", attemptCount: 1, errorCode: null, updatedAt: "2026-07-31T12:05:00Z" },
  };
}

describe("CategoryManager", () => {
  beforeEach(() => {
    mocks.mutate.mockReset().mockResolvedValue(mutationWith(initial.categories));
  });

  it("lists categories with dish counts and stays accessible", async () => {
    const { container } = render(<CategoryManager initial={initial} />);

    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => within(item).getByText(/Starters|Mains|Desserts/).textContent))
      .toEqual(["Starters", "Mains", "Desserts"]);
    expect(within(items[0]).getByText("2 dishes")).toBeVisible();
    expect(within(items[1]).getByText("1 dish")).toBeVisible();
    expect(within(items[2]).getByText("0 dishes")).toBeVisible();

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it("creates a category and clears the form without reloading", async () => {
    const user = userEvent.setup();
    const created = [...initial.categories, category("d", "Brunch", 3)];
    mocks.mutate.mockResolvedValue(mutationWith(created));
    render(<CategoryManager initial={initial} />);

    await user.type(screen.getByLabelText("Name"), "Brunch");
    await user.type(screen.getByLabelText("Description"), "Weekend only");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/menu/categories", "POST", { name: "Brunch", description: "Weekend only" }, '"draft-4"'));
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByText("Brunch")).toBeVisible();
    expect(screen.getByText(/Category saved\. Publishing succeeded\./)).toBeVisible();
  });

  it("renames a category from an inline form", async () => {
    const user = userEvent.setup();
    render(<CategoryManager initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Rename Mains" }));
    const field = screen.getByLabelText("Category name");
    await user.clear(field);
    await user.type(field, "Large Plates");
    await user.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/menu/categories/b", "PATCH", { name: "Large Plates", description: null }, '"draft-4"'));
    expect(screen.queryByLabelText("Category name")).toBeNull();
  });

  it("reorders with the keyboard and reports the new position", async () => {
    const user = userEvent.setup();
    render(<CategoryManager initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Move Desserts up" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/menu/categories/reorder", "PATCH", { categoryIds: ["a", "c", "b"] }, '"draft-4"'));
    expect(await screen.findByText(/Desserts moved to position 2 of 3/)).toBeVisible();
  });

  it("disables the move buttons at the ends of the list", () => {
    render(<CategoryManager initial={initial} />);
    expect(screen.getByRole("button", { name: "Move Starters up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Desserts down" })).toBeDisabled();
  });

  it("confirms before deleting and explains a category that still has dishes", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValue(new BrowserApiError(409, { code: "category_contains_dishes" }));
    render(<CategoryManager initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Delete Starters" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Delete “Starters”\?/)).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete Starters" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/menu/categories/a", "DELETE", undefined, '"draft-4"'));
    expect(await screen.findByText(/Move or delete this category's dishes/)).toBeVisible();
    expect(screen.getByText("Starters")).toBeVisible();
  });

  it("shows field validation errors and preserves typed values", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValue(new BrowserApiError(400, {
      code: "admin_validation", errors: { name: ["field_length_invalid"] },
    }));
    render(<CategoryManager initial={initial} />);

    await user.type(screen.getByLabelText("Name"), "   ");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    expect(await screen.findByText(/Use a valid value within the allowed length/)).toBeVisible();
    expect(screen.getByLabelText(/^Name/)).toHaveValue("   ");
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute("aria-invalid", "true");
  });

  it("offers a reload path when the draft changed elsewhere", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValue(new BrowserApiError(409, { code: "concurrency_conflict" }));
    render(<CategoryManager initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Move Mains up" }));

    expect(await screen.findByText(/The menu changed elsewhere/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload latest" })).toBeVisible();
  });

  it("explains when the restaurant has no active menu", () => {
    render(<CategoryManager initial={{ ...initial, menuId: null, menuName: null, categories: [] }} />);
    expect(screen.getByText(/no active menu yet/)).toBeVisible();
  });
});

describe("moveCategory", () => {
  const list = [category("a", "A", 0), category("b", "B", 1), category("c", "C", 2)];

  it("moves an item to a new position", () => {
    expect(moveCategory(list, 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveCategory(list, 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("returns the original order for no-op or out-of-range moves", () => {
    expect(moveCategory(list, 1, 1)).toEqual(["a", "b", "c"]);
    expect(moveCategory(list, 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveCategory(list, 0, 5)).toEqual(["a", "b", "c"]);
  });
});
