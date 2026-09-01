import { describe, expect, it } from "vitest";

import { brandInitials, brandLogoVariant } from "./brand";
import type { PublicImage } from "./restaurant-contract";

const logo: PublicImage = {
  altText: "Prairie Table logo",
  variants: [
    { url: "/media/logo-512.webp", width: 512, height: 512 },
    { url: "/media/logo-96.webp", width: 96, height: 96 },
    { url: "/media/logo-256.webp", width: 256, height: 256 },
  ],
};

describe("restaurant branding", () => {
  it("picks the smallest logo variant regardless of variant order", () => {
    expect(brandLogoVariant(logo)?.url).toBe("/media/logo-96.webp");
  });

  it("treats a pre-Phase-6 snapshot without a logo as having none", () => {
    expect(brandLogoVariant(null)).toBeNull();
    expect(brandLogoVariant(undefined)).toBeNull();
    expect(brandLogoVariant({ altText: "", variants: [] })).toBeNull();
  });

  it("derives the brand mark from the restaurant's own name", () => {
    expect(brandInitials("Prairie Table")).toBe("PT");
    expect(brandInitials("  café   boréal  ")).toBe("CB");
    expect(brandInitials("Nightfall")).toBe("N");
    expect(brandInitials("The Prairie Table and Northern Harvest")).toBe("TP");
  });

  it("produces no mark at all when the restaurant is unknown", () => {
    expect(brandInitials(null)).toBe("");
    expect(brandInitials(undefined)).toBe("");
    expect(brandInitials("   ")).toBe("");
  });
});
