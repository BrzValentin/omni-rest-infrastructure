import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ordinaryMenu } from "@/test/fixtures";

import { BadgeList } from "./BadgeList";
import { DishCard } from "./DishCard";

describe("DishCard", () => {
  it("renders text, exact price, accessible fallback, badges, and explicit unavailable state", () => {
    const dish = ordinaryMenu.menu!.categories[2]!.dishes[0]!;
    render(<DishCard currency="CAD" dish={{ ...dish, media: null }} locale="en-CA" />);

    expect(screen.getByRole("heading", { name: "Tomato Soup" })).toBeVisible();
    expect(screen.getByText(/8\.00/)).toBeVisible();
    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.getByRole("img", { name: /Tomato Soup: Image unavailable/ })).toBeVisible();
    expect(screen.getByText("Vegan")).toBeVisible();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("omits unknown badges and warns once", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unknown = { code: "unknown_test_badge", labelKey: "menu.badge.unknown", category: "dietary" as const };
    const { rerender } = render(<BadgeList badges={[unknown]} />);
    rerender(<BadgeList badges={[unknown]} />);
    expect(screen.queryByText("menu.badge.unknown")).not.toBeInTheDocument();
    expect(warning).toHaveBeenCalledOnce();
  });
});
