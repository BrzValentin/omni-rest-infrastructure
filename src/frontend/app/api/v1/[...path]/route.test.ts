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
