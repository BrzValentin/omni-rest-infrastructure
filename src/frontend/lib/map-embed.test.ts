import { describe, expect, it } from "vitest";

import { mapEmbedUrl } from "./map-embed";

const winnipeg = { latitude: 49.8951, longitude: -97.1384 };

describe("mapEmbedUrl", () => {
  it("uses the documented Maps Embed API when a key is configured", () => {
    const url = new URL(mapEmbedUrl(winnipeg, "test-key")!);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/embed/v1/place");
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.get("q")).toBe("49.8951,-97.1384");
  });

  it("falls back to the keyless embed so the map still shows in local development", () => {
    const url = new URL(mapEmbedUrl(winnipeg)!);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps");
    expect(url.searchParams.get("output")).toBe("embed");
    expect(url.searchParams.get("q")).toBe("49.8951,-97.1384");
    expect(url.searchParams.has("key")).toBe(false);
  });

  it.each([
    ["an empty key", ""],
    ["a whitespace key", "   "],
    ["a null key", null],
  ])("treats %s as no key rather than sending an empty one", (_label, key) => {
    expect(mapEmbedUrl(winnipeg, key)).toContain("output=embed");
  });

  it.each([
    ["no location", null],
    ["missing latitude", { latitude: null, longitude: -97.1384 }],
    ["missing longitude", { latitude: 49.8951, longitude: null }],
    ["an out-of-range latitude", { latitude: 91, longitude: 0 }],
    ["an out-of-range longitude", { latitude: 0, longitude: 181 }],
    ["a non-finite value", { latitude: Number.NaN, longitude: 0 }],
  ])("renders no map for %s, so the page shows the address alone (Task 2.10)", (_label, location) => {
    expect(mapEmbedUrl(location, "test-key")).toBeNull();
  });

  it("accepts zero as a real coordinate instead of treating it as missing", () => {
    // A truthiness check would drop the equator and the prime meridian.
    expect(mapEmbedUrl({ latitude: 0, longitude: 0 })).toContain("q=0%2C0");
  });

  it("escapes the key so a configured value cannot inject extra parameters", () => {
    const url = new URL(mapEmbedUrl(winnipeg, "abc&q=elsewhere")!);
    expect(url.searchParams.get("key")).toBe("abc&q=elsewhere");
    expect(url.searchParams.getAll("q")).toEqual(["49.8951,-97.1384"]);
  });
});
