import React from "react";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import { message } from "@/lib/menu-messages";
import NotFound, { metadata } from "./not-found";

// `lib/seo.ts` is marked `server-only`, which throws on import outside an RSC render. Neutralising
// the marker keeps the real `nonIndexableMetadata` under test rather than a stand-in for it.
vi.mock("server-only", () => ({}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => React.createElement("img", props),
}));

describe("root NotFound", () => {
  it("uses its own copy instead of claiming the restaurant does not exist", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText(message("notFoundBody"))).toBeInTheDocument();
    // This page serves any unmatched path on a perfectly healthy restaurant. Borrowing the
    // "no public restaurant for this address" line told that visitor the restaurant was gone.
    expect(document.body.textContent).not.toContain(message("unknownRestaurantBody"));
  });

  it("offers no retry, because a wrong address does not come right on a second try", () => {
    render(<NotFound />);

    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("keeps the shell's way back without naming any tenant", () => {
    const { container } = render(<NotFound />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(container.querySelector(".publicBrandMark")).toBeNull();
    expect(container.textContent).not.toMatch(/Omni/i);
  });

  it("stays out of the index and emits no canonical", () => {
    // A 404 captured as content is worse than one that is never crawled at all.
    expect(metadata.robots).toMatchObject({ index: false });
    expect(metadata.alternates?.canonical ?? null).toBeNull();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<NotFound />);

    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
