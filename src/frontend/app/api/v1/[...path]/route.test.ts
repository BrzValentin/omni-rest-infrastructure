import { describe, expect, it } from "vitest";
import * as route from "./route";

/**
 * The browser client can send any of these methods, so the proxy must export a handler for each.
 * A missing export makes Next.js answer 405 before the request ever reaches the API.
 */
const methods = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

describe("admin API proxy", () => {
  for (const method of methods) {
    it(`forwards ${method}`, () => {
      expect(typeof route[method]).toBe("function");
    });
  }

  it("exports the same handler for every method", () => {
    const handlers = new Set(methods.map((method) => route[method]));
    expect(handlers.size).toBe(1);
  });
});

/**
 * The API proxy resolves the tenant from `Host` exactly as the backend does. A request without a
 * usable one is refused here rather than forwarded under a default host, which would answer it with
 * one specific restaurant's data.
 */
describe("admin API proxy tenant resolution", () => {
  const proxyRequest = (host: string | null) => {
    const headers = new Headers();
    if (host !== null) headers.set("host", host);
    return { headers, method: "GET" } as never;
  };
  const params = { params: Promise.resolve({ path: ["public", "menu"] }) };

  it("answers 404 when the request carries no usable Host", async () => {
    for (const host of [null, "", "menu.localhost/other", "user:secret@menu.localhost"]) {
      const response = await route.GET(proxyRequest(host), params);
      expect(response.status, String(host)).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toMatchObject({ code: "restaurant_not_found" });
    }
  });
});
