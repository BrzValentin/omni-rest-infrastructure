import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";

import { GET } from "./route";

/**
 * The media proxy forwards the request `Host` so the API serves the right restaurant's images. It used
 * to default that host to one specific tenant, which meant an unaddressed request was answered with
 * that tenant's media. These cases never reach the network: they are refused before the upstream call.
 */
function mediaRequest(host: string | null): NextRequest {
  const headers = new Headers({ accept: "image/*" });
  if (host !== null) headers.set("host", host);
  return { headers } as unknown as NextRequest;
}

const params = (path: string[]) => ({ params: Promise.resolve({ path }) });

describe("media proxy tenant resolution", () => {
  it("refuses a request that carries no Host header", async () => {
    const response = await GET(mediaRequest(null), params(["uploads", "a.webp"]));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a malformed Host rather than falling back to a default tenant", async () => {
    for (const host of ["", "other.localhost/../menu.localhost", "user:secret@menu.localhost", "a b"]) {
      expect((await GET(mediaRequest(host), params(["uploads", "a.webp"]))).status, host).toBe(404);
    }
  });

  it("still rejects a traversal in the media path", async () => {
    const response = await GET(mediaRequest("menu.localhost:3000"), params(["..", "secret.webp"]));

    expect(response.status).toBe(404);
  });
});
