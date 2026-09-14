import { describe, expect, it } from "vitest";

import { isSocialPlatform, socialPlatformLabels, socialPlatforms } from "./restaurant-contract";
import { platformForUrl } from "./social-platforms";

describe("platformForUrl", () => {
  it("recognises the Facebook profile URL from the BUG-006 report as Facebook", () => {
    expect(platformForUrl("https://www.facebook.com/profile.php?id=100073564902779")).toBe("facebook");
  });

  it.each([
    ["https://instagram.com/prairie", "instagram"],
    ["https://www.instagram.com/prairie", "instagram"],
    ["https://facebook.com/prairie", "facebook"],
    ["https://tiktok.com/@prairie", "tiktok"],
    ["https://www.tiktok.com/@prairie", "tiktok"],
    ["https://google.com/maps/place/prairie", "google_business"],
    ["https://www.google.com/maps/place/prairie", "google_business"],
    ["https://maps.google.com/?cid=1", "google_business"],
    ["https://maps.app.goo.gl/abc123", "google_business"],
    ["https://x.com/prairie", "x"],
    ["https://www.x.com/prairie", "x"],
    ["https://twitter.com/prairie", "x"],
    ["https://www.twitter.com/prairie", "x"],
    ["https://youtube.com/@prairie", "youtube"],
    ["https://www.youtube.com/@prairie", "youtube"],
    ["https://m.youtube.com/@prairie", "youtube"],
    ["https://youtu.be/abc123", "youtube"],
    ["https://linkedin.com/company/prairie", "linkedin"],
    ["https://www.linkedin.com/company/prairie", "linkedin"],
  ])("maps %s to %s, mirroring the backend host list", (url, platform) => {
    expect(platformForUrl(url)).toBe(platform);
  });

  it("matches the hostname regardless of letter case and surrounding whitespace", () => {
    expect(platformForUrl("  HTTPS://WWW.FaceBook.com/Prairie  ")).toBe("facebook");
  });

  it("recognises the platform of a plain http URL and leaves rejecting the scheme to the backend", () => {
    expect(platformForUrl("http://www.facebook.com/prairie")).toBe("facebook");
  });

  it("recognises no platform for a host that only resembles an approved one", () => {
    expect(platformForUrl("https://facebook.com.example.test/prairie")).toBeNull();
    expect(platformForUrl("https://notfacebook.com/prairie")).toBeNull();
    expect(platformForUrl("https://business.facebook.com/prairie")).toBeNull();
  });

  it("recognises no platform while the URL is still incomplete or is not a web address", () => {
    for (const partial of ["", "https://", "https://face", "facebook.com/prairie", "mailto:hello@facebook.com", "ftp://facebook.com/x"]) {
      expect(platformForUrl(partial)).toBeNull();
    }
  });
});

describe("social platform contract", () => {
  it("offers an owner-facing label for every platform key the backend accepts", () => {
    expect(socialPlatforms).toEqual(["instagram", "facebook", "tiktok", "google_business", "x", "youtube", "linkedin"]);
    for (const platform of socialPlatforms) {
      expect(socialPlatformLabels[platform]).toMatch(/\S/);
    }
  });

  it("accepts only the exact lower-case platform keys", () => {
    expect(isSocialPlatform("facebook")).toBe(true);
    expect(isSocialPlatform("Facebook")).toBe(false);
    expect(isSocialPlatform("twitter")).toBe(false);
    expect(isSocialPlatform(undefined)).toBe(false);
  });
});
