import { readFileSync } from "node:fs";
import path from "node:path";

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { websiteDesignIds, type WebsiteDesignId } from "@/lib/restaurant-contract";
import { ordinaryMenu, ordinaryRestaurant } from "@/test/fixtures";
import { HomeDesignRenderer } from "./HomeDesignRenderer";
import { MenuDesignRenderer } from "./MenuDesignRenderer";
import { designStylesheetHrefs } from "./designStylesheets";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    for (const key of ["loader", "unoptimized", "sizes", "priority"]) {
      Reflect.deleteProperty(imageProps, key);
    }
    return React.createElement("img", imageProps);
  },
}));

const frontendRoot = path.resolve(import.meta.dirname, "..", "..");

function source(relativePath: string) {
  return readFileSync(path.join(frontendRoot, relativePath), "utf8");
}

function hasUseClient(relativePath: string) {
  return /^\s*["']use client["']/.test(source(relativePath));
}

const designIds = Object.values(websiteDesignIds) as readonly WebsiteDesignId[];

/**
 * The renderers used to be client components purely so they could call `next/dynamic`, which made
 * every leaf design, the shared parts, and the whole shell client modules by inheritance. These
 * tests pin the boundary in both directions: the render path stays on the server, and the two
 * genuinely interactive pieces stay islands.
 */
describe("public design server/client boundary", () => {
  afterEach(() => cleanup());

  it("keeps the design renderers and everything they render on the server", () => {
    const serverModules = [
      "components/designs/HomeDesignRenderer.tsx",
      "components/designs/MenuDesignRenderer.tsx",
      "components/designs/shared/PublicDesignParts.tsx",
      "components/PublicShell.tsx",
      "components/designs/legacy/LegacyHome.tsx",
      "components/designs/legacy/LegacyMenu.tsx",
      "components/designs/quiet-elegance/QuietEleganceHome.tsx",
      "components/designs/quiet-elegance/QuietEleganceMenu.tsx",
      "components/designs/nightfall/NightfallHome.tsx",
      "components/designs/nightfall/NightfallMenu.tsx",
      "components/designs/broadsheet/BroadsheetHome.tsx",
      "components/designs/broadsheet/BroadsheetMenu.tsx",
      "components/designs/sunroom/SunroomHome.tsx",
      "components/designs/sunroom/SunroomMenu.tsx",
    ];
    for (const serverModule of serverModules) {
      expect(hasUseClient(serverModule), `${serverModule} must not be a client module`).toBe(false);
    }
    // A dynamic import is what forced the client boundary in the first place; the switch replaces it.
    expect(source("components/designs/HomeDesignRenderer.tsx")).not.toContain('from "next/dynamic"');
    expect(source("components/designs/MenuDesignRenderer.tsx")).not.toContain('from "next/dynamic"');
  });

  it("keeps the browser and the gallery as client islands", () => {
    for (const island of [
      "components/designs/shared/DesignMenuBrowser.tsx",
      "components/designs/shared/DesignGallery.tsx",
      "components/designs/shared/DesignGalleryLightbox.tsx",
    ]) {
      expect(hasUseClient(island), `${island} must stay a client island`).toBe(true);
    }
  });

  it("loads the lightbox lazily rather than with the gallery grid", () => {
    const gallery = source("components/designs/shared/DesignGallery.tsx");
    expect(gallery).toContain('dynamic(() => import("./DesignGalleryLightbox"))');
    // The portal, focus trap, and swipe handling must live in the lazy module, not the grid.
    expect(gallery).not.toContain("createPortal");
  });

  it("sends gallery tiles through the image optimizer", () => {
    const gallery = source("components/designs/shared/DesignGallery.tsx");
    expect(gallery).not.toContain("unoptimized");
    expect(gallery).not.toContain("loader=");
    expect(gallery).toContain("sizes={thumbnailSizes}");
  });

  for (const designId of designIds) {
    it(`${designId} renders its home design and links only its own stylesheet`, () => {
      const { container } = render(
        <HomeDesignRenderer designId={designId} restaurant={ordinaryRestaurant} />,
      );

      expect(container.querySelector(`[data-website-design="${designId}"]`)).not.toBeNull();
      expect(screen.getByRole("heading", { level: 1, name: ordinaryRestaurant.name })).toBeVisible();
      expectSingleStylesheet(designId);
    });

    it(`${designId} renders its menu design and links only its own stylesheet`, () => {
      const { container } = render(
        <MenuDesignRenderer designId={designId} site={{ ...ordinaryMenu, websiteDesignId: designId }} />,
      );

      expect(container.querySelector(`[data-website-design="${designId}"]`)).not.toBeNull();
      expect(screen.getByRole("heading", { name: "Prairie Poutine" })).toBeInTheDocument();
      expectSingleStylesheet(designId);
    });
  }

  it("falls back to the retained design when the publication names an unknown one", () => {
    const { container } = render(
      <HomeDesignRenderer designId="a-design-that-was-never-shipped" restaurant={ordinaryRestaurant} />,
    );

    expect(container.querySelector(`[data-website-design="${websiteDesignIds.legacyCurrent}"]`)).not.toBeNull();
    expectSingleStylesheet(websiteDesignIds.legacyCurrent);
  });
});

/**
 * React hoists `<link precedence>` out of the tree and into the document, and deliberately leaves it
 * there after unmount so a stylesheet a later render needs again does not flicker away. Every render
 * in this file therefore shares one head, so the assertion is scoped by the design's own marker
 * attribute: exactly one link for this design, pointing at this design's stylesheet and nothing else.
 */
function expectSingleStylesheet(designId: WebsiteDesignId) {
  const links = document.querySelectorAll<HTMLLinkElement>(`link[data-design-stylesheet="${designId}"]`);
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe(designStylesheetHrefs[designId]);
  expect(links[0].getAttribute("rel")).toBe("stylesheet");
}
