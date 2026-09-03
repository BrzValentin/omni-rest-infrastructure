import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { publicMenuUrl } from "./public-menu-url";
import { UnsafeHostError } from "./site-origin";

describe("publicMenuUrl", () => {
  const previousScheme = process.env.OMNI_REST_PUBLIC_SCHEME;

  beforeEach(() => {
    // The scheme heuristic is what most of these cases exercise, so deployment configuration is cleared
    // rather than inherited from whatever the test runner happens to be started with.
    delete process.env.OMNI_REST_PUBLIC_SCHEME;
  });

  afterEach(() => {
    if (previousScheme === undefined) delete process.env.OMNI_REST_PUBLIC_SCHEME;
    else process.env.OMNI_REST_PUBLIC_SCHEME = previousScheme;
  });

  it("builds the https menu URL for a production public host", () => {
    expect(publicMenuUrl("menu.example.com")).toBe("https://menu.example.com/menu");
  });

  it("lowercases the host so the printed code and the canonical tag are the same URL", () => {
    expect(publicMenuUrl("Menu.Example.COM.")).toBe("https://menu.example.com/menu");
  });

  it("falls back to http for a loopback host so a development code is addressable", () => {
    expect(publicMenuUrl("menu.localhost", { port: "3000" })).toBe("http://menu.localhost:3000/menu");
  });

  it("lets an explicit scheme override beat the loopback heuristic", () => {
    expect(publicMenuUrl("menu.localhost", { scheme: "https", port: "3000" })).toBe(
      "https://menu.localhost:3000/menu",
    );
  });

  it("ignores a scheme that is not http or https rather than emitting it", () => {
    // `javascript:` in a QR code would be a scannable payload, not a URL.
    expect(publicMenuUrl("menu.example.com", { scheme: "javascript" })).toBe(
      "https://menu.example.com/menu",
    );
  });

  it("prefers deployment configuration over the heuristic when no override is passed", () => {
    process.env.OMNI_REST_PUBLIC_SCHEME = "https";
    expect(publicMenuUrl("menu.localhost", { port: "3000" })).toBe("https://menu.localhost:3000/menu");
  });

  it("attaches the configured port, which the backend's host column can never carry", () => {
    expect(publicMenuUrl("menu.example.com", { port: "8443" })).toBe(
      "https://menu.example.com:8443/menu",
    );
  });

  it("omits the port in production, where the site is on 443", () => {
    expect(publicMenuUrl("menu.example.com")).not.toContain(":443");
  });

  it("drops a port that is the scheme's default so the code encodes the canonical spelling", () => {
    // A printed `https://menu.example.com:443/menu` would send every scan through a needless redirect.
    expect(publicMenuUrl("menu.example.com", { port: "443" })).toBe("https://menu.example.com/menu");
    expect(publicMenuUrl("menu.localhost", { port: "80" })).toBe("http://menu.localhost/menu");
  });

  it.each([
    ["a non-numeric port", "3000a"],
    ["an empty port", ""],
    ["a negative port", "-1"],
    ["a leading-zero port", "03000"],
    ["a port with whitespace", " 3000"],
    ["a smuggled path", "3000/evil"],
    ["a port above the valid range", "70000"],
  ])("refuses %s", (_label, port) => {
    expect(() => publicMenuUrl("menu.example.com", { port })).toThrow(UnsafeHostError);
  });

  it("refuses a host that already carries a port instead of guessing which one wins", () => {
    expect(() => publicMenuUrl("menu.example.com:3000")).toThrow(UnsafeHostError);
  });

  it.each([
    ["an empty host", ""],
    ["embedded credentials", "user:pass@menu.example.com"],
    ["an injected at-sign", "menu.example.com@evil.com"],
    ["a path", "menu.example.com/evil"],
    ["whitespace", "menu.example.com evil.com"],
    ["a comma-joined forwarded chain", "menu.example.com,evil.com"],
    ["a backslash", "menu.example.com\\evil"],
    ["a full URL", "https://menu.example.com"],
    ["an over-long host", `${"a".repeat(260)}.com`],
  ])("refuses %s rather than printing it onto a table tent", (_label, host) => {
    expect(() => publicMenuUrl(host)).toThrow(UnsafeHostError);
  });

  it("always encodes exactly /menu, with no query string and no fragment", () => {
    // Ruling 10: nothing this platform emits carries tracking parameters, and a printed `?src=qr` could
    // never be removed.
    for (const url of [
      publicMenuUrl("menu.example.com"),
      publicMenuUrl("menu.localhost", { port: "3000" }),
      publicMenuUrl("menu.example.com", { scheme: "http", port: "8080" }),
    ]) {
      expect(url).not.toContain("?");
      expect(url).not.toContain("#");
      expect(new URL(url).pathname).toBe("/menu");
      expect(new URL(url).search).toBe("");
      expect(new URL(url).hash).toBe("");
    }
  });

  it("round-trips through the URL parser unchanged, so the scanned URL is the built one", () => {
    const url = publicMenuUrl("menu.example.com", { port: "8443" });
    expect(new URL(url).href).toBe(url);
  });
});
