import type { PublicMenuResponse } from "@/lib/menu-contract";
import type { WebsiteDesignId } from "@/lib/restaurant-contract";
import { resolveWebsiteDesignId, websiteDesignIds } from "@/lib/restaurant-contract";
import type { WebsiteDesignMenuRenderer } from "./design-contract";
import { designStylesheetHrefs } from "./designStylesheets";
import BroadsheetMenu from "./broadsheet/BroadsheetMenu";
import LegacyMenu from "./legacy/LegacyMenu";
import NightfallMenu from "./nightfall/NightfallMenu";
import QuietEleganceMenu from "./quiet-elegance/QuietEleganceMenu";
import SunroomMenu from "./sunroom/SunroomMenu";

/**
 * Selects one of the five menu designs on the server.
 *
 * This module used to be a client component for one reason only: `next/dynamic` needs a client
 * boundary to code-split on. That single `"use client"` made the whole subtree below it — every leaf
 * design, `PublicShell`, the shared design parts, and all 1,000 dishes on the large-menu fixture —
 * client modules that had to be shipped and hydrated. Resolving the design here instead means the
 * designs never reach the browser at all, which is a stronger version of the guarantee the dynamic
 * map was buying: a visitor downloads none of the four designs they did not select, rather than
 * merely skipping the other four chunks.
 *
 * The interactive islands are unchanged and still carry their own `"use client"`: `DesignMenuBrowser`
 * (hash-driven category switching) and, on the home renderer, `DesignGallery` (lightbox).
 */
const menuRenderers: Readonly<Record<WebsiteDesignId, WebsiteDesignMenuRenderer>> = {
  [websiteDesignIds.legacyCurrent]: LegacyMenu,
  [websiteDesignIds.quietElegance]: QuietEleganceMenu,
  [websiteDesignIds.nightfall]: NightfallMenu,
  [websiteDesignIds.broadsheet]: BroadsheetMenu,
  [websiteDesignIds.sunroom]: SunroomMenu,
};

export function MenuDesignRenderer({
  designId,
  site,
}: Readonly<{ designId: unknown; site: PublicMenuResponse }>) {
  const resolvedDesignId = resolveWebsiteDesignId(designId);
  const Renderer = menuRenderers[resolvedDesignId];
  return (
    <>
      <link
        data-design-stylesheet={resolvedDesignId}
        href={designStylesheetHrefs[resolvedDesignId]}
        precedence="design"
        rel="stylesheet"
      />
      <Renderer site={site} />
    </>
  );
}
