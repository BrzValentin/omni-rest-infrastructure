import { describe, expect, it } from "vitest";

import { tenantHost, tenantHostOrNull, UnresolvableTenantHostError } from "./tenant-host";

/**
 * The platform resolves every restaurant from `Host`. These rules are the reason an unknown or absent
 * host cannot be served another tenant's site: there is no fallback host anywhere in the frontend.
 */
describe("tenant host resolution", () => {
  it("normalizes a usable host to its lower-cased hostname", () => {
    expect(tenantHost("Menu.Localhost")).toBe("menu.localhost");
    expect(tenantHost("menu.localhost:3000")).toBe("menu.localhost");
    expect(tenantHost("menu.localhost.")).toBe("menu.localhost");
    expect(tenantHost("127.0.0.1:5279")).toBe("127.0.0.1");
  });

  it("refuses a missing host instead of substituting a default", () => {
    for (const absent of [null, undefined, ""]) {
      expect(() => tenantHost(absent)).toThrow(UnresolvableTenantHostError);
      expect(tenantHostOrNull(absent)).toBeNull();
    }
  });

  it("refuses a host that smuggles anything beyond an authority", () => {
    // Written this way so the backslash case is unmistakable in source.
    const backslash = String.fromCharCode(92);
    const unusable = [
      "menu.localhost/../other.localhost",
      "menu.localhost/menu",
      "menu.localhost?tenant=other",
      "menu.localhost#other",
      "user:secret@other.localhost",
      "menu.localhost, other.localhost",
      `menu.localhost${backslash}other`,
      "menu localhost",
      "menu.localhost\nX-Injected: 1",
      `${"a".repeat(260)}.localhost`,
    ];
    for (const host of unusable) {
      expect(tenantHostOrNull(host), host).toBeNull();
    }
  });

  it("never falls back to a tenant that was not asked for", () => {
    for (const host of [null, "", "not a host", "://"]) {
      expect(tenantHostOrNull(host)).not.toBe("menu.localhost");
    }
  });
});
