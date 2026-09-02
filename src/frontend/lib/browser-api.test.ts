import { beforeEach, describe, expect, it, vi } from "vitest";
import { antiforgeryToken, browserGet, BrowserApiError, mutate } from "./browser-api";

describe("browser API client", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  it("gets JSON with same-origin credentials", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ value: 1 }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(browserGet<{ value: number }>("/value")).resolves.toEqual({ value: 1 });
    expect(fetch).toHaveBeenCalledWith("/value", expect.objectContaining({
      cache: "no-store",
      credentials: "same-origin",
      signal: expect.any(AbortSignal),
    }));
  });

  it("reports GET problems and network failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: "missing", title: "Missing" }), { status: 404 }));
    await expect(browserGet("/missing")).rejects.toMatchObject({ status: 404, message: "Missing" });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("offline"));
    await expect(browserGet("/offline")).rejects.toMatchObject({ status: 0 });
  });

  it("fetches antiforgery tokens and rejects unavailable token endpoints", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ token: "token" }), { status: 200 }));
    await expect(antiforgeryToken()).resolves.toBe("token");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(antiforgeryToken()).rejects.toBeInstanceOf(BrowserApiError);
  });

  it("sends JSON mutations with antiforgery and ETag headers", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ saved: true }), { status: 200 }));
    await expect(mutate<{ saved: boolean }>("/item", "PUT", { name: "Test" }, '"draft-1"')).resolves.toEqual({ saved: true });
    const options = vi.mocked(fetch).mock.calls[1][1]!;
    const headers = options.headers as Headers;
    expect(headers.get("X-CSRF-TOKEN")).toBe("token");
    expect(headers.get("if-match")).toBe('"draft-1"');
    expect(options.body).toBe('{"name":"Test"}');
  });

  it("supports no-content deletes and surfaces mutation problems and network errors", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(mutate("/item", "DELETE")).resolves.toBeNull();

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "conflict", title: "Conflict" }), { status: 409 }));
    await expect(mutate("/item", "POST", {})).rejects.toMatchObject({ status: 409, message: "Conflict" });

    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "token" }), { status: 200 }))
      .mockRejectedValueOnce(new TypeError("offline"));
    await expect(mutate("/item", "POST", {})).rejects.toMatchObject({ status: 0 });
  });
});

/**
 * Nothing in this module had a deadline, so a stalled connection left the calling editor disabled
 * and spinning with no way out short of reloading the browser.
 */
describe("browser API timeouts", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  it("bounds every request with an abort signal", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ saved: true }), { status: 200 }));
    await mutate("/item", "PUT", { name: "Test" });

    for (const call of vi.mocked(fetch).mock.calls) {
      expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("reports a timeout as a timeout while keeping the existing network contract", async () => {
    const timeout = new Error("The operation timed out.");
    timeout.name = "TimeoutError";
    vi.mocked(fetch).mockRejectedValueOnce(timeout);

    const error = await browserGet("/slow").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BrowserApiError);
    // `status: 0` and `code: "network_error"` are the sentinel and code every existing call site
    // already branches on, so a timeout must keep both. Only `kind` distinguishes it.
    expect(error).toMatchObject({ status: 0, kind: "timeout" });
    expect((error as BrowserApiError).problem.code).toBe("network_error");
  });

  it("still reports an unreachable server as a network failure", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(browserGet("/offline")).rejects.toMatchObject({ status: 0, kind: "network" });
  });

  it("derives a kind from the status when the constructor is not told one", () => {
    expect(new BrowserApiError(404, { code: "missing" }).kind).toBe("notFound");
    expect(new BrowserApiError(403, { code: "forbidden" }).kind).toBe("denied");
    expect(new BrowserApiError(409, { code: "concurrency_conflict" }).kind).toBe("validation");
    expect(new BrowserApiError(503, { code: "auth_unavailable" }).kind).toBe("server");
  });

  it("keeps status, problem, and message exactly as call sites expect", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "admin_validation", title: "Invalid", errors: { name: ["too_long"] } }), { status: 400 }),
    );

    await expect(browserGet("/item")).rejects.toMatchObject({
      status: 400,
      kind: "validation",
      message: "Invalid",
      problem: { errors: { name: ["too_long"] } },
    });
  });
});
