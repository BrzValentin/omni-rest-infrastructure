import React from "react";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { message } from "@/lib/menu-messages";
import RestaurantNotFound from "./not-found";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => React.createElement("img", props),
}));

describe("menu RestaurantNotFound", () => {
  it("says the address resolves to no restaurant, which the root 404 no longer claims", () => {
    render(<RestaurantNotFound />);

    expect(screen.getByRole("heading", { level: 1, name: message("unknownRestaurantTitle") })).toBeInTheDocument();
    expect(screen.getByText(message("unknownRestaurantBody"))).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(message("notFoundBody"));
  });

  it("offers no retry and names no tenant", () => {
    const { container } = render(<RestaurantNotFound />);

    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    // The restaurant is exactly what could not be resolved, so no brand may appear here.
    expect(container.querySelector(".publicBrandMark")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toMatch(/Omni/i);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<RestaurantNotFound />);

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
