import React from "react";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserApiError } from "@/lib/browser-api";
import { formatAdminPrice, type AdminDish, type AdminMenu, type AdminMenuMutation } from "@/lib/menu-admin-contract";
import type { AdminMediaAsset } from "@/lib/restaurant-contract";
import { DishManager } from "./DishManager";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), uploadMedia: vi.fn() }));
vi.mock("@/lib/browser-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/browser-api")>(),
  mutate: mocks.mutate,
  uploadMedia: mocks.uploadMedia,
}));
vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => {
  const imageProps = { ...props };
  Reflect.deleteProperty(imageProps, "loader");
  Reflect.deleteProperty(imageProps, "unoptimized");
  return React.createElement("img", imageProps);
} }));

const media: AdminMediaAsset = {
  id: "media-1", altText: "Poutine bowl", processingStatus: "ready",
  variants: [{ url: "/media/uploads/poutine.webp", width: 640, height: 480 }],
};

function dish(id: string, name: string, price: string, displayOrder: number, overrides: Partial<AdminDish> = {}): AdminDish {
  return {
    id, categoryId: "cat-1", name, description: null, price, availability: "available", isActive: true,
    displayOrder, mediaAssetId: null, media: null, badges: [],
    createdAt: "2026-07-31T12:00:00Z", updatedAt: "2026-07-31T12:00:00Z", ...overrides,
  };
}

const initial: AdminMenu = {
  menuId: "menu-1",
  menuName: "All Day Menu",
  categories: [
    {
      id: "cat-1", name: "Starters", description: null, slug: "starters", displayOrder: 0, isActive: true,
      dishCount: 2, createdAt: "2026-07-31T12:00:00Z", updatedAt: "2026-07-31T12:00:00Z",
      dishes: [
        dish("dish-1", "Prairie Poutine", "12.50", 0, { badges: ["vegetarian", "popular"], mediaAssetId: media.id, media }),
        dish("dish-2", "Roasted Tomato Soup", "8.00", 1, { availability: "unavailable" }),
      ],
    },
    {
      id: "cat-2", name: "Mains", description: null, slug: "mains", displayOrder: 1, isActive: true,
      dishCount: 0, dishes: [], createdAt: "2026-07-31T12:00:00Z", updatedAt: "2026-07-31T12:00:00Z",
    },
  ],
  locale: "en-CA",
  currency: "CAD",
  taxDisplayMode: "exclusive",
  taxNoticeKey: "menu.tax.exclusive",
  availableBadges: ["contains_nuts", "dairy_free", "gluten_free", "halal", "new", "popular", "spicy", "vegan", "vegetarian"],
  draftVersion: "4",
  eTag: '"draft-4"',
  publicationStatus: { operationId: "op", status: "succeeded", draftVersion: "4", attemptCount: 1, errorCode: null, updatedAt: "2026-07-31T12:00:00Z" },
};

const mutation: AdminMenuMutation = {
  menu: { ...initial, draftVersion: "5", eTag: '"draft-5"' },
  publication: { operationId: "op2", status: "succeeded", draftVersion: "5", attemptCount: 1, errorCode: null, updatedAt: "2026-07-31T12:05:00Z" },
};

describe("DishManager", () => {
  beforeEach(() => {
    mocks.mutate.mockReset().mockResolvedValue(mutation);
    mocks.uploadMedia.mockReset();
  });

  it("lists dishes with price, availability, flags, and image, and stays accessible", async () => {
    const { container } = render(<DishManager initial={initial} initialMedia={[media]} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Prairie Poutine")).toBeVisible();
    expect(within(items[0]).getByText(formatAdminPrice("12.50", "en-CA", "CAD"))).toBeVisible();
    expect(within(items[0]).getByText("Available")).toBeVisible();
    expect(within(items[0]).getByText("Vegetarian, Popular")).toBeVisible();
    expect(within(items[0]).getByRole("img", { name: "Poutine bowl" })).toBeVisible();
    expect(within(items[1]).getByText("Unavailable")).toBeVisible();

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it("creates a dish with a price, description, and dietary flags", async () => {
    const user = userEvent.setup();
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.type(screen.getByLabelText("Name"), "Bannock Basket");
    await user.type(screen.getByLabelText("Price (CAD)"), "9.25");
    await user.type(screen.getByLabelText("Description"), "Warm, with honey butter.");
    await user.click(screen.getByRole("checkbox", { name: "Vegan" }));
    await user.click(screen.getByRole("button", { name: "Add dish" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/menu/dishes", "POST", {
      categoryId: "cat-1",
      name: "Bannock Basket",
      price: 9.25,
      description: "Warm, with honey butter.",
      mediaAssetId: null,
      availability: "available",
      badges: ["vegan"],
    }, '"draft-4"'));
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("pre-fills the form when editing and can clear the optional fields", async () => {
    const user = userEvent.setup();
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.click(screen.getByRole("button", { name: "Edit Prairie Poutine" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Prairie Poutine");
    expect(screen.getByLabelText("Price (CAD)")).toHaveValue(12.5);
    expect(screen.getByRole("checkbox", { name: "Vegetarian" })).toBeChecked();
    expect(screen.getByLabelText("Image")).toHaveValue("media-1");

    await user.click(screen.getByRole("button", { name: "Remove image" }));
    await user.click(screen.getByRole("checkbox", { name: "Vegetarian" }));
    await user.click(screen.getByRole("button", { name: "Save dish" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/menu/dishes/dish-1", "PATCH", {
      categoryId: "cat-1",
      name: "Prairie Poutine",
      price: 12.5,
      description: null,
      mediaAssetId: null,
      availability: "available",
      badges: ["popular"],
    }, '"draft-4"'));
  });

  it("cancels an edit without saving", async () => {
    const user = userEvent.setup();
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.click(screen.getByRole("button", { name: "Edit Prairie Poutine" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add dish" })).toBeVisible();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("moves a dish to another category", async () => {
    const user = userEvent.setup();
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.click(screen.getByRole("button", { name: "Edit Roasted Tomato Soup" }));
    await user.selectOptions(screen.getByLabelText("Category"), "cat-2");
    await user.click(screen.getByRole("button", { name: "Save dish" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/menu/dishes/dish-2", "PATCH", expect.objectContaining({ categoryId: "cat-2" }), '"draft-4"'));
  });

  it("confirms before deleting and explains that the dish leaves the menu", async () => {
    const user = userEvent.setup();
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.click(screen.getByRole("button", { name: "Delete Prairie Poutine" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/Delete “Prairie Poutine”\?/)).toBeVisible();
    expect(within(dialog).getByText(/set it to Unavailable/)).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mocks.mutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete Prairie Poutine" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/menu/dishes/dish-1", "DELETE", undefined, '"draft-4"'));
  });

  it("toggles availability without touching any other dish field", async () => {
    const user = userEvent.setup();
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.click(screen.getByRole("button", { name: "Mark Prairie Poutine unavailable" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/menu/dishes/dish-1/availability", "PATCH", { status: "unavailable" }, '"draft-4"'));

    await user.click(screen.getByRole("button", { name: "Mark Roasted Tomato Soup available" }));
    // The second save carries the ETag returned by the first one.
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/menu/dishes/dish-2/availability", "PATCH", { status: "available" }, '"draft-5"'));
  });

  it("reorders dishes inside the selected category", async () => {
    const user = userEvent.setup();
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.click(screen.getByRole("button", { name: "Move Roasted Tomato Soup up" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("/api/v1/admin/menu/dishes/reorder", "PATCH",
      { categoryId: "cat-1", dishIds: ["dish-2", "dish-1"] }, '"draft-4"'));
    expect(await screen.findByText(/Roasted Tomato Soup moved to position 1 of 2/)).toBeVisible();
  });

  it("uploads an image and selects it for the dish", async () => {
    const user = userEvent.setup();
    const uploaded: AdminMediaAsset = { ...media, id: "media-2", altText: "Bannock" };
    mocks.uploadMedia.mockResolvedValue(uploaded);
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.upload(screen.getByLabelText("Upload a new image"),
      new File(["bytes"], "bannock.png", { type: "image/png" }));
    await user.type(screen.getByLabelText("Image alt text"), "Bannock");
    await user.click(screen.getByRole("button", { name: "Upload image" }));

    await waitFor(() => expect(screen.getByLabelText("Image")).toHaveValue("media-2"));
    expect(screen.getByText(/Image uploaded and selected/)).toBeVisible();
  });

  it("reports a rejected image upload without losing the form", async () => {
    const user = userEvent.setup();
    mocks.uploadMedia.mockRejectedValue(new BrowserApiError(400, { code: "admin_validation" }));
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.type(screen.getByLabelText("Name"), "Bannock Basket");
    await user.upload(screen.getByLabelText("Upload a new image"),
      new File(["bytes"], "bannock.png", { type: "image/png" }));
    await user.type(screen.getByLabelText("Image alt text"), "Bannock");
    await user.click(screen.getByRole("button", { name: "Upload image" }));

    expect(await screen.findByText(/must be a valid PNG, JPEG, or WebP/)).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Bannock Basket");
  });

  it("shows per-field validation errors from the API", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValue(new BrowserApiError(400, {
      code: "admin_validation", errors: { price: ["price_scale_invalid"] },
    }));
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.type(screen.getByLabelText("Name"), "Bannock");
    await user.type(screen.getByLabelText("Price (CAD)"), "9.25");
    await user.click(screen.getByRole("button", { name: "Add dish" }));

    expect(await screen.findByText(/at most two decimal places/)).toBeVisible();
    expect(screen.getByLabelText(/^Price \(CAD\)/)).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a status badge for every dish however long the list is", () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      dish(`bulk-${index}`, `Dish ${index}`, "5.00", index,
        { availability: index % 2 === 0 ? "available" : "unavailable" }));
    render(<DishManager initial={{
      ...initial,
      categories: [{ ...initial.categories[0], dishes: many, dishCount: many.length }],
    }} initialMedia={[]} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(40);
    const list = within(screen.getByRole("list"));
    expect(list.getAllByText("Available")).toHaveLength(20);
    expect(list.getAllByText("Unavailable")).toHaveLength(20);
  });

  it("asks for a category before dishes can be added", () => {
    render(<DishManager initial={{ ...initial, categories: [] }} initialMedia={[]} />);
    expect(screen.getByText(/Add at least one menu category/)).toBeVisible();
  });

  it("saves one price from the dish row through the price-only endpoint", async () => {
    const user = userEvent.setup();
    render(<DishManager initial={initial} initialMedia={[media]} />);

    const field = screen.getByLabelText("Price for Prairie Poutine");
    const button = screen.getByRole("button", { name: "Save price for Prairie Poutine" });
    expect(field).toHaveValue(12.5);
    expect(button).toBeDisabled();

    await user.clear(field);
    await user.type(field, "13.75");
    expect(button).toBeEnabled();
    await user.click(button);

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(
      "/api/v1/admin/menu/dishes/dish-1/price", "PATCH", { price: 13.75 }, '"draft-4"'));
    // The whole-dish endpoint stays untouched: a price change no longer rewrites every other field.
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Prairie Poutine is now/)).toBeVisible();
  });

  it("keeps a rejected price beside the dish it came from", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValue(new BrowserApiError(400, {
      code: "admin_validation", errors: { price: ["price_scale_invalid"] },
    }));
    render(<DishManager initial={initial} initialMedia={[media]} />);

    const field = screen.getByLabelText("Price for Roasted Tomato Soup");
    await user.clear(field);
    await user.type(field, "8.001");
    await user.click(screen.getByRole("button", { name: "Save price for Roasted Tomato Soup" }));

    expect(await screen.findByText(/at most two decimal places/)).toBeVisible();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveValue(8.001);
    // The dish form below keeps its own price field clean; only the row that failed is marked.
    expect(screen.getByLabelText("Price (CAD)")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("filters dishes by name across every category and pauses reordering while it does", async () => {
    const user = userEvent.setup();
    const soup = dish("dish-3", "Winter Squash Soup", "14.00", 0, { categoryId: "cat-2" });
    render(<DishManager initialMedia={[media]} initial={{
      ...initial,
      categories: [initial.categories[0], { ...initial.categories[1], dishes: [soup], dishCount: 1 }],
    }} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await user.type(screen.getByLabelText("Search dishes by name"), "soup");

    const matches = screen.getAllByRole("listitem");
    expect(matches).toHaveLength(2);
    expect(within(matches[0]).getByText("Roasted Tomato Soup")).toBeVisible();
    expect(within(matches[1]).getByText("Winter Squash Soup")).toBeVisible();
    // The category each match lives in is named, since the list now spans all of them.
    expect(within(matches[1]).getByText("Mains")).toBeVisible();
    expect(screen.getByText(/2 of 3 dishes match/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Move Roasted Tomato Soup down" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Move Prairie Poutine down" })).toBeEnabled();
  });

  it("says so plainly when no dish matches the search", async () => {
    const user = userEvent.setup();
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.type(screen.getByLabelText("Search dishes by name"), "tiramisu");

    expect(screen.getByText(/No dish matches “tiramisu”/)).toBeVisible();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("sends the owner back to sign in when the session ends mid-save, keeping the form", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValue(new BrowserApiError(401, { code: "unauthorized" }));
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.type(screen.getByLabelText("Name"), "Bannock Basket");
    await user.type(screen.getByLabelText("Price (CAD)"), "9.25");
    await user.click(screen.getByRole("button", { name: "Add dish" }));

    expect(await screen.findByText(/Your session ended/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in again" }))
      .toHaveAttribute("href", "/admin/login?returnPath=%2Fadmin");
    expect(screen.getByLabelText("Name")).toHaveValue("Bannock Basket");
    // Retrying the save cannot help until they are signed in, so it is not offered.
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("re-issues the last save from a Try again button", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockRejectedValueOnce(new BrowserApiError(503, { code: "unexpected_error" }));
    render(<DishManager initial={initial} initialMedia={[media]} />);

    await user.type(screen.getByLabelText("Name"), "Bannock Basket");
    await user.type(screen.getByLabelText("Price (CAD)"), "9.25");
    await user.click(screen.getByRole("button", { name: "Add dish" }));

    expect(await screen.findByText(/Saving failed/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
    expect(mocks.mutate).toHaveBeenLastCalledWith("/api/v1/admin/menu/dishes", "POST",
      expect.objectContaining({ name: "Bannock Basket", price: 9.25 }), '"draft-4"');
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("warns before the browser walks away from a half-typed dish", async () => {
    const user = userEvent.setup();
    render(<DishManager initial={initial} initialMedia={[media]} />);

    const clean = createEvent("beforeunload", window, { cancelable: true });
    fireEvent(window, clean);
    expect(clean.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText("Name"), "Bannock Basket");

    const dirty = createEvent("beforeunload", window, { cancelable: true });
    fireEvent(window, dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("keeps the status bar free of draft version numbers and publication states", () => {
    render(<DishManager initial={initial} initialMedia={[media]} />);
    expect(screen.queryByText(/Draft 4/)).toBeNull();
    expect(screen.queryByText(/succeeded/)).toBeNull();
    expect(screen.getByText("Last saved")).toBeVisible();
    expect(screen.getByText("Website up to date")).toBeVisible();
  });
});

describe("formatAdminPrice", () => {
  it("formats a canonical amount for the restaurant locale", () => {
    expect(formatAdminPrice("12.50", "en-CA", "CAD")).toContain("12.50");
  });

  it("falls back to the raw amount for an unusable currency", () => {
    expect(formatAdminPrice("12.50", "en-CA", "NOT-A-CURRENCY")).toBe("12.50 NOT-A-CURRENCY");
  });
});
