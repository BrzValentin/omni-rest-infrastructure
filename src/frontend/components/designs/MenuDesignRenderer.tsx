"use client";

import dynamic from "next/dynamic";

import type { PublicMenuResponse } from "@/lib/menu-contract";
import type { WebsiteDesignId } from "@/lib/restaurant-contract";
import { resolveWebsiteDesignId, websiteDesignIds } from "@/lib/restaurant-contract";
import type { WebsiteDesignMenuRenderer } from "./design-contract";
import { designStylesheetHrefs } from "./designStylesheets";

const menuRenderers: Readonly<Record<WebsiteDesignId, WebsiteDesignMenuRenderer>> = {
  [websiteDesignIds.legacyCurrent]: dynamic(() => import("./legacy/LegacyMenu")),
  [websiteDesignIds.quietElegance]: dynamic(() => import("./quiet-elegance/QuietEleganceMenu")),
  [websiteDesignIds.nightfall]: dynamic(() => import("./nightfall/NightfallMenu")),
  [websiteDesignIds.broadsheet]: dynamic(() => import("./broadsheet/BroadsheetMenu")),
  [websiteDesignIds.sunroom]: dynamic(() => import("./sunroom/SunroomMenu")),
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
