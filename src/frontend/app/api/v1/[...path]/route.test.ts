import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

const upstream = vi.hoisted(() => vi.fn());
vi.mock("node:http", () => ({ request: upstream, default: { request: upstream } }));
vi.mock("node:https", () => ({ request: upstream, default: { request: upstream } }));

import * as route from "./route";

type FakeRequest = EventEmitter & {
  /** The deadline callback the proxy registered, so a test can fire it on demand. */
  timeout?: () => void;
  setTimeout: (ms: number, callback: () => void) => void;
  write: (chunk: unknown) => void;
  end: () => void;
  destroy: (error?: Error) => void;
};

type FakeResponse = EventEmitter & { statusCode: number; headers: Record<string, string> };

/** A stand-in for `ClientRequest` whose `destroy` emits `error`, exactly as the real one does. */
function fakeRequest(): FakeRequest {
  const request = new EventEmitter() as FakeRequest;
  request.setTimeout = (_ms, callback) => { request.timeout = () => { callback(); }; };
  request.write = () => {};
  request.end = () => {};
  request.destroy = (error) => { request.emit("error", error ?? new Error("destroyed")); };
  return request;
}

function fakeResponse(statusCode = 200): FakeResponse {
  const response = new EventEmitter() as FakeResponse;
  response.statusCode = statusCode;
  response.headers = { "content-type": "application/json" };
  return response;
}

beforeEach(() => upstream.mockReset());

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

/**
 * An upstream that never answers used to `reject` the handler promise, which reached the caller as an
 * opaque framework `500` carrying an HTML body — unreadable by a client that expects a problem
 * document. Worse, a fault raised on the *response* stream had no listener at all, so the promise
 * simply never settled and the request hung until the platform killed it.
 */
describe("admin API proxy upstream failures", () => {
  const proxyRequest = () => ({
    headers: new Headers({ host: "menu.localhost:3000" }),
    method: "GET",
    nextUrl: { search: "" },
  } as never);
  const params = { params: Promise.resolve({ path: ["public", "menu"] }) };

  it("answers an unreachable upstream with a 502 problem document", async () => {
    upstream.mockImplementationOnce(() => {
      const request = fakeRequest();
      queueMicrotask(() => request.emit("error", new Error("ECONNREFUSED")));
      return request;
    });

    const response = await route.GET(proxyRequest(), params);

    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "upstream_unavailable" });
  });

  it("answers a timed-out upstream with a 504 problem document", async () => {
    upstream.mockImplementationOnce(() => {
      const request = fakeRequest();
      queueMicrotask(() => request.timeout?.());
      return request;
    });

    const response = await route.GET(proxyRequest(), params);

    expect(response.status).toBe(504);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "upstream_timeout" });
  });

  it("settles when the fault arrives on the response stream rather than the request", async () => {
    upstream.mockImplementationOnce((_url: unknown, _options: unknown, onResponse: (r: FakeResponse) => void) => {
      const request = fakeRequest();
      queueMicrotask(() => {
        const response = fakeResponse();
        onResponse(response);
        response.emit("error", new Error("aborted mid-stream"));
      });
      return request;
    });

    // Before the response listener existed this promise never settled at all, so a bounded wait is
    // the assertion: the test would otherwise hang rather than fail.
    const response = await Promise.race([
      route.GET(proxyRequest(), params),
      new Promise<never>((_, reject) => globalThis.setTimeout(() => reject(new Error("promise never settled")), 1_000)),
    ]);

    expect(response.status).toBe(502);
  });
});
