import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ordinaryRestaurant } from "@/test/fixtures";
import { PublicShell } from "./PublicShell";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    Reflect.deleteProperty(imageProps, "sizes");
    return React.createElement("img", imageProps);
  },
}));

describe("PublicShell", () => {
  it("brands the header with the restaurant's published logo", () => {
    const { container } = render(
      <PublicShell restaurantName={ordinaryRestaurant.name} logo={ordinaryRestaurant.logo}>
        <main id="main-content" />
      </PublicShell>,
    );

    const logo = container.querySelector('img[src="/media/logo.webp"]');
    expect(logo).not.toBeNull();
    expect(logo).toHaveAttribute("alt", "");
    expect(screen.getByRole("link", { name: "Prairie Table home" })).toHaveAttribute("href", "/");
    expect(container.querySelector(".publicBrandMark")).toBeNull();
  });

  it("falls back to the restaurant's own initials, never a platform glyph", () => {
    const { container } = render(
      <PublicShell restaurantName="Prairie Table">
        <main id="main-content" />
      </PublicShell>,
    );

    expect(container.querySelector(".publicBrandMark")?.textContent).toBe("PT");
    expect(container.textContent).not.toContain("OR");
    expect(container.textContent).not.toMatch(/Omni/i);
  });

  it("shows no brand at all when the restaurant is unknown", () => {
    const { container } = render(
      <PublicShell>
        <main id="main-content" />
      </PublicShell>,
    );

    // The 404 and error states render before any restaurant is resolved. Naming one there would
    // advertise a brand that belongs to no restaurant on this host.
    expect(container.textContent).not.toMatch(/Omni/i);
    expect(container.querySelector(".publicBrandMark")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".publicFooter")?.textContent).toBe("");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  });

  it("links to the menu by default, which is also the 404 pages' way out", () => {
    render(
      <PublicShell restaurantName="Prairie Table">
        <main id="main-content" />
      </PublicShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByRole("link", { name: "Menu" })).toHaveAttribute("href", "/menu");
  });

  it("links home instead when it is the menu page's own header (BUG-008)", () => {
    render(
      <PublicShell restaurantName="Prairie Table" currentPage="menu">
        <main id="main-content" />
      </PublicShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(nav).queryByRole("link", { name: "Menu" })).not.toBeInTheDocument();
  });
});
