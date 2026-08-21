import { describe, expect, it } from "vitest";

import { websiteDesignIds } from "@/lib/restaurant-contract";
import { selectableWebsiteDesignIds, websiteDesignMetadata } from "./catalog";

describe("website design catalog", () => {
  it("keeps the four selectable literal IDs aligned with renderer metadata", () => {
    expect(selectableWebsiteDesignIds).toEqual([
      "quiet-elegance-v1",
      "nightfall-v1",
      "broadsheet-v1",
      "sunroom-v1",
    ]);
    expect(Object.keys(websiteDesignMetadata)).toEqual(Object.values(websiteDesignIds));
    expect(websiteDesignMetadata[websiteDesignIds.legacyCurrent]).toMatchObject({
      id: "legacy-current-v1",
      tone: "legacy",
    });
  });
});
