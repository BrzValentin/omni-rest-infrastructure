import { websiteDesignIds, type WebsiteDesignId } from "@/lib/restaurant-contract";

export const designStylesheetHrefs: Readonly<Record<WebsiteDesignId, string>> = {
  [websiteDesignIds.legacyCurrent]: "/design-previews/styles/legacy-current-v1.css",
  [websiteDesignIds.quietElegance]: "/design-previews/styles/quiet-elegance-v1.css",
  [websiteDesignIds.nightfall]: "/design-previews/styles/nightfall-v1.css",
  [websiteDesignIds.broadsheet]: "/design-previews/styles/broadsheet-v1.css",
  [websiteDesignIds.sunroom]: "/design-previews/styles/sunroom-v1.css",
};
