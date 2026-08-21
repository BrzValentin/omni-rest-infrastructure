"use client";

import dynamic from "next/dynamic";

import type { PublicRestaurant, WebsiteDesignId } from "@/lib/restaurant-contract";
import { resolveWebsiteDesignId, websiteDesignIds } from "@/lib/restaurant-contract";
import type { WebsiteDesignHomeRenderer } from "./design-contract";
import { designStylesheetHrefs } from "./designStylesheets";

const homeRenderers: Readonly<Record<WebsiteDesignId, WebsiteDesignHomeRenderer>> = {
  [websiteDesignIds.legacyCurrent]: dynamic(() => import("./legacy/LegacyHome")),
  [websiteDesignIds.quietElegance]: dynamic(() => import("./quiet-elegance/QuietEleganceHome")),
  [websiteDesignIds.nightfall]: dynamic(() => import("./nightfall/NightfallHome")),
  [websiteDesignIds.broadsheet]: dynamic(() => import("./broadsheet/BroadsheetHome")),
  [websiteDesignIds.sunroom]: dynamic(() => import("./sunroom/SunroomHome")),
};

export function HomeDesignRenderer({
  designId,
  restaurant,
}: Readonly<{ designId: unknown; restaurant: PublicRestaurant | null }>) {
  const resolvedDesignId = resolveWebsiteDesignId(designId);
  const Renderer = homeRenderers[resolvedDesignId];
  return (
    <>
      <link
        data-design-stylesheet={resolvedDesignId}
        href={designStylesheetHrefs[resolvedDesignId]}
        precedence="design"
        rel="stylesheet"
      />
      <Renderer restaurant={restaurant} />
    </>
  );
}
