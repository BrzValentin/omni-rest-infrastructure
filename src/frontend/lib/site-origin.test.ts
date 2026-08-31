import { describe, expect, it } from "vitest";

import {
  absoluteUrlFrom,
  buildOrigin,
  normalizeOriginHost,
  resolveScheme,
  UnsafeHostError,
} from "./site-origin";

describe("normalizeOriginHost", () => {
  it("keeps the port so local development origins stay addressable", () => {
    expect(normalizeOriginHost("menu.localhost:3000")).toBe("menu.localhost:3000");
  });

  it("lowercases the hostname and drops a fully qualified trailing dot", () => {
    expect(normalizeOriginHost("Menu.Example.COM.")).toBe("menu.example.com");
  });

  it.each([
    ["no header", null],
    ["empty string", ""],
    ["embedded whitespace", "menu.example.com evil.com"],
    ["a comma-joined forwarded chain", "menu.example.com,evil.com"],
    ["a path", "menu.example.com/evil"],
    ["a backslash", "menu.example.com\\evil"],
    ["credentials", "user:pass@menu.example.com"],
    ["an over-long value", `${"a".repeat(260)}.com`],
  ])("rejects %s", (_label, host) => {
    expect(() => normalizeOriginHost(host)).toThrow(UnsafeHostError);
  });

  it("does not let an injected host smuggle a second authority", () => {
    // A canonical tag built from this would point search engines at an attacker origin.
    expect(() => normalizeOriginHost("menu.example.com/../evil.com")).toThrow(UnsafeHostError);
  });
});

describe("resolveScheme", () => {
  it("prefers deployment-owned configuration over any heuristic", () => {
    expect(resolveScheme("menu.localhost:3000", "https")).toBe("https");
    expect(resolveScheme("menu.example.com", "http")).toBe("http");
  });

  it("ignores a configuration value that is not a known scheme", () => {
    expect(resolveScheme("menu.example.com", "javascript")).toBe("https");
    expect(resolveScheme("menu.example.com", undefined)).toBe("https");
  });

  it("falls back to http only for loopback-family hosts", () => {
    expect(resolveScheme("menu.localhost:3000", undefined)).toBe("http");
    expect(resolveScheme("localhost:3000", undefined)).toBe("http");
    expect(resolveScheme("127.0.0.1:3000", undefined)).toBe("http");
    expect(resolveScheme("menu.example.com", undefined)).toBe("https");
  });

  it("does not treat a lookalike public host as loopback", () => {
    expect(resolveScheme("notlocalhost.com", undefined)).toBe("https");
    expect(resolveScheme("localhost.evil.com", undefined)).toBe("https");
  });
});

describe("buildOrigin", () => {
  it("builds a scheme-correct origin with no trailing slash", () => {
    expect(buildOrigin("menu.localhost:3000")).toBe("http://menu.localhost:3000");
  });
});

describe("absoluteUrlFrom", () => {
  const origin = "https://menu.example.com";

  it("joins a root-relative path", () => {
    expect(absoluteUrlFrom(origin, "/menu")).toBe("https://menu.example.com/menu");
  });

  it("strips query strings and fragments so canonicals stay parameter-free", () => {
    expect(absoluteUrlFrom(origin, "/menu?ref=qr#mains")).toBe("https://menu.example.com/menu");
  });

  it("normalizes traversal rather than emitting it", () => {
    expect(absoluteUrlFrom(origin, "/menu/../menu/starters")).toBe("https://menu.example.com/menu/starters");
  });

  it("percent-encodes a slug so the URL stays well formed", () => {
    expect(absoluteUrlFrom(origin, "/menu/café")).toBe("https://menu.example.com/menu/caf%C3%A9");
  });

  it.each([
    ["a relative path", "menu"],
    ["a protocol-relative path", "//evil.com/menu"],
    ["an absolute foreign URL", "https://evil.com/menu"],
  ])("refuses %s", (_label, path) => {
    expect(() => absoluteUrlFrom(origin, path)).toThrow(UnsafeHostError);
  });
});

describe("scheme configuration source", () => {
  it("does not read OMNI_REST_FORWARDED_PROTO", () => {
    // That variable is set to `https` in local development as a deliberate lie, so the API will issue
    // Secure cookies over plain HTTP. Canonical URLs must not inherit it.
    const previous = process.env.OMNI_REST_FORWARDED_PROTO;
    const previousPublic = process.env.OMNI_REST_PUBLIC_SCHEME;
    process.env.OMNI_REST_FORWARDED_PROTO = "https";
    delete process.env.OMNI_REST_PUBLIC_SCHEME;
    try {
      expect(buildOrigin("menu.localhost:3000")).toBe("http://menu.localhost:3000");
    } finally {
      if (previous === undefined) delete process.env.OMNI_REST_FORWARDED_PROTO;
      else process.env.OMNI_REST_FORWARDED_PROTO = previous;
      if (previousPublic !== undefined) process.env.OMNI_REST_PUBLIC_SCHEME = previousPublic;
    }
  });

  it("honours OMNI_REST_PUBLIC_SCHEME when it is set", () => {
    const previous = process.env.OMNI_REST_PUBLIC_SCHEME;
    process.env.OMNI_REST_PUBLIC_SCHEME = "https";
    try {
      expect(buildOrigin("menu.localhost:3000")).toBe("https://menu.localhost:3000");
    } finally {
      if (previous === undefined) delete process.env.OMNI_REST_PUBLIC_SCHEME;
      else process.env.OMNI_REST_PUBLIC_SCHEME = previous;
    }
  });
});
