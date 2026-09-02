import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const upstream = vi.hoisted(() => vi.fn());
vi.mock("node:http", () => ({ request: upstream, default: { request: upstream } }));
vi.mock("node:https", () => ({ request: upstream, default: { request: upstream } }));

import { GET } from "./route";

type FakeRequest = EventEmitter & {
  /** The deadline callback the proxy registered, so a test can fire it on demand. */
  timeout?: () => void;
  setTimeout: (ms: number, callback: () => void) => void;
  end: () => void;
  destroy: (error?: Error) => void;
};

type FakeResponse = EventEmitter & { statusCode: number; headers: Record<string, string> };

/** A stand-in for `ClientRequest` whose `destroy` emits `error`, exactly as the real one does. */
function fakeRequest(): FakeRequest {
  const client = new EventEmitter() as FakeRequest;
  client.setTimeout = (_ms, callback) => { client.timeout = () => { callback(); }; };
  client.end = () => {};
  client.destroy = (error) => { client.emit("error", error ?? new Error("destroyed")); };
  return client;
}

function fakeResponse(statusCode = 200): FakeResponse {
  const response = new EventEmitter() as FakeResponse;
  response.statusCode = statusCode;
  response.headers = { "content-type": "image/webp" };
  return response;
}

beforeEach(() => upstream.mockReset());

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

/**
 * The media proxy had the same two faults as the API proxy: a bare `reject` on upstream error, which
 * reached the browser as a framework `500` with an HTML body in place of an image, and no listener on
 * the response stream, so a fault part-way through an image left the request hanging for good.
 */
describe("media proxy upstream failures", () => {
  const request = () => mediaRequest("menu.localhost:3000");
  const path = params(["uploads", "a.webp"]);

  it("answers an unreachable upstream with a 502 problem document that is never cached", async () => {
    upstream.mockImplementationOnce(() => {
      const client = fakeRequest();
      queueMicrotask(() => client.emit("error", new Error("ECONNREFUSED")));
      return client;
    });

    const response = await GET(request(), path);

    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    // A cached failure is what the old blanket `max-age=3600` produced; this must never be stored.
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "upstream_unavailable" });
  });

  it("answers a timed-out upstream with a 504 problem document", async () => {
    upstream.mockImplementationOnce(() => {
      const client = fakeRequest();
      queueMicrotask(() => client.timeout?.());
      return client;
    });

    const response = await GET(request(), path);

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({ code: "upstream_timeout" });
  });

  it("settles when the image body fails part-way through", async () => {
    upstream.mockImplementationOnce((_url: unknown, _options: unknown, onResponse: (r: FakeResponse) => void) => {
      const client = fakeRequest();
      queueMicrotask(() => {
        const response = fakeResponse();
        onResponse(response);
        response.emit("data", Buffer.from("partial"));
        response.emit("error", new Error("aborted mid-stream"));
      });
      return client;
    });

    const response = await Promise.race([
      GET(request(), path),
      new Promise<never>((_, reject) => globalThis.setTimeout(() => reject(new Error("promise never settled")), 1_000)),
    ]);

    expect(response.status).toBe(502);
  });
});
