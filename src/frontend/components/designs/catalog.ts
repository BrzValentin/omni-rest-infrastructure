import { websiteDesignIds, type WebsiteDesignId } from "@/lib/restaurant-contract";

export type SelectableWebsiteDesignId = Exclude<WebsiteDesignId, typeof websiteDesignIds.legacyCurrent>;
export type DesignPreviewTone = "quiet" | "night" | "news" | "sun" | "legacy";

export type WebsiteDesignMetadata = Readonly<{
  id: WebsiteDesignId;
  name: string;
  description: string;
  tone: DesignPreviewTone;
}>;

export const websiteDesignMetadata: Readonly<Record<WebsiteDesignId, WebsiteDesignMetadata>> = {
  [websiteDesignIds.legacyCurrent]: {
    id: websiteDesignIds.legacyCurrent,
    name: "Current design",
    description: "The original Omni REST presentation retained for existing restaurants.",
    tone: "legacy",
  },
  [websiteDesignIds.quietElegance]: {
    id: websiteDesignIds.quietElegance,
    name: "Quiet Elegance",
    description: "Refined ivory surfaces, restrained typography, and generous space.",
    tone: "quiet",
  },
  [websiteDesignIds.nightfall]: {
    id: websiteDesignIds.nightfall,
    name: "Nightfall",
    description: "A dramatic evening palette with warm highlights and cinematic scale.",
    tone: "night",
  },
  [websiteDesignIds.broadsheet]: {
    id: websiteDesignIds.broadsheet,
    name: "Broadsheet",
    description: "Editorial columns, strong rules, and a confident monochrome voice.",
    tone: "news",
  },
  [websiteDesignIds.sunroom]: {
    id: websiteDesignIds.sunroom,
    name: "Sunroom",
    description: "Bright colour, soft shapes, and an easy daytime atmosphere.",
    tone: "sun",
  },
};

export const selectableWebsiteDesignIds: readonly SelectableWebsiteDesignId[] = [
  websiteDesignIds.quietElegance,
  websiteDesignIds.nightfall,
  websiteDesignIds.broadsheet,
  websiteDesignIds.sunroom,
];
