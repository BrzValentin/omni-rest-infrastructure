import React from "react";
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { PublicRestaurant } from "@/lib/restaurant-contract";
import { RestaurantPreview } from "./RestaurantPreview";

vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => React.createElement("img", props) }));

const fixture: PublicRestaurant = {
  id: "restaurant", name: "Prairie Table", shortDescription: "Seasonal", email: "hello@example.test", timeZone: "America/Winnipeg",
  phone: { e164: "+12045550123", display: "(204) 555-0123" },
  address: { streetLine1: "1 Main", streetLine2: null, city: "Winnipeg", region: "MB", postalCode: "R3C 1A1", countryCode: "CA", formatted: "1 Main, Winnipeg", directionsUrl: "https://maps.example.test" },
  regularHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, intervals: dayOfWeek ? [{ opensAt: "09:00:00", closesAt: "17:00:00", closesNextDay: false }] : [] })),
  specialHours: [{ date: "2026-12-25", isClosed: true, note: "Holiday", intervals: [] }],
  status: { state: "open", label: "Open", nextChangeAt: null, source: "regularHours" },
  socialLinks: [{ platform: "instagram", url: "https://instagram.com/example" }],
  mainImage: { altText: "Dining room", variants: [{ url: "https://images.example.test/main.webp", width: 800, height: 600 }] }, publicationVersion: "3",
};

describe("RestaurantPreview", () => {
  it("renders the private draft presentation with all public details accessibly", async () => {
    const { container } = render(<RestaurantPreview restaurant={fixture} />);
    expect(screen.getByText("Draft preview", { exact: true })).toBeVisible();
    expect(screen.getByRole("link", { name: "Call (204) 555-0123" })).toHaveAttribute("href", "tel:+12045550123");
    expect(screen.getByText(/2026-12-25/)).toBeVisible();
    expect(screen.getByRole("img", { name: "Dining room" })).toBeVisible();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});
