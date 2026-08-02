import { beforeEach, describe, expect, it, vi } from "vitest";
import { antiforgeryToken, browserGet, BrowserApiError, mutate } from "./browser-api";

describe("browser API client", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

  it("gets JSON with same-origin credentials", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ value: 1 }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(browserGet<{ value: number }>("/value")).resolves.toEqual({ value: 1 });
    expect(fetch).toHaveBeenCalledWith("/value", { cache: "no-store", credentials: "same-origin" });
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
