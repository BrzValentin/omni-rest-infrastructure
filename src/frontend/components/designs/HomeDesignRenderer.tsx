import type { PublicRestaurant, WebsiteDesignId } from "@/lib/restaurant-contract";
import { resolveWebsiteDesignId, websiteDesignIds } from "@/lib/restaurant-contract";
import type { WebsiteDesignHomeRenderer } from "./design-contract";
import { designStylesheetHrefs } from "./designStylesheets";
import BroadsheetHome from "./broadsheet/BroadsheetHome";
import LegacyHome from "./legacy/LegacyHome";
import NightfallHome from "./nightfall/NightfallHome";
import QuietEleganceHome from "./quiet-elegance/QuietEleganceHome";
import SunroomHome from "./sunroom/SunroomHome";

/**
 * Selects one of the five home designs on the server. See `MenuDesignRenderer` for why the
 * `next/dynamic` map that used to live here was a client boundary the public site could not afford.
 */
const homeRenderers: Readonly<Record<WebsiteDesignId, WebsiteDesignHomeRenderer>> = {
  [websiteDesignIds.legacyCurrent]: LegacyHome,
  [websiteDesignIds.quietElegance]: QuietEleganceHome,
  [websiteDesignIds.nightfall]: NightfallHome,
  [websiteDesignIds.broadsheet]: BroadsheetHome,
  [websiteDesignIds.sunroom]: SunroomHome,
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
