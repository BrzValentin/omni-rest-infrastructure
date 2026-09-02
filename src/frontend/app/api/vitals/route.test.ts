import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://menu.localhost/api/vitals", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

function logged(spy: ReturnType<typeof vi.spyOn>): Array<{ name: string; value: number; id: string }> {
  const call = spy.mock.calls.at(-1);
  if (!call) return [];
  return JSON.parse(String(call[1])).metrics;
}

describe("web vitals endpoint", () => {
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records the supported metrics and answers without a body", async () => {
    const response = await POST(post(JSON.stringify({
      metrics: [
        { name: "LCP", value: 1234.5, id: "abc123" },
        { name: "CLS", value: 0.04, id: "abc123" },
      ],
    })));

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(logged(info)).toEqual([
      { name: "LCP", value: 1234.5, id: "abc123" },
      { name: "CLS", value: 0.04, id: "abc123" },
    ]);
  });

  it("drops metric names it does not recognise rather than logging them back", async () => {
    await POST(post(JSON.stringify({
      metrics: [
        { name: "LCP", value: 10, id: "abc" },
        { name: "documentCookie", value: 1, id: "abc" },
      ],
    })));

    expect(logged(info).map((metric) => metric.name)).toEqual(["LCP"]);
  });

  it("rejects a value that is negative, non-finite, or not a number", async () => {
    await POST(post(JSON.stringify({
      metrics: [
        { name: "LCP", value: -1, id: "a" },
        { name: "FCP", value: "120", id: "a" },
        { name: "TTFB", value: 42, id: "a" },
      ],
    })));

    expect(logged(info)).toEqual([{ name: "TTFB", value: 42, id: "a" }]);
  });

  it("replaces an id that is not a plain short token, so nothing arbitrary reaches the log", async () => {
    await POST(post(JSON.stringify({
      metrics: [{ name: "LCP", value: 1, id: "../../etc/passwd\n[injected]" }],
    })));

    expect(logged(info)).toEqual([{ name: "LCP", value: 1, id: "unknown" }]);
  });

  it("caps how many metrics one beacon can contribute", async () => {
    await POST(post(JSON.stringify({
      metrics: Array.from({ length: 12 }, () => ({ name: "LCP", value: 1, id: "a" })),
    })));

    expect(logged(info)).toHaveLength(5);
  });

  it("refuses an oversized body by its declared length without reading it", async () => {
    const response = await POST(post("{}", { "content-length": String(5_000) }));

    expect(response.status).toBe(413);
    expect(info).not.toHaveBeenCalled();
  });

  it("refuses an oversized body that declared no length", async () => {
    const response = await POST(post(JSON.stringify({
      metrics: [{ name: "LCP", value: 1, id: "a".repeat(8_000) }],
    })));

    expect(response.status).toBe(413);
  });

  it("answers 400 on malformed JSON instead of throwing", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    expect(info).not.toHaveBeenCalled();
  });

  it("stays silent when the payload carries no usable metric", async () => {
    const response = await POST(post(JSON.stringify({ metrics: [] })));

    expect(response.status).toBe(204);
    expect(info).not.toHaveBeenCalled();
  });

  it("tolerates a payload whose shape is entirely wrong", async () => {
    for (const body of ["null", "[]", '"metrics"', '{"metrics":{}}']) {
      const response = await POST(post(body));
      expect(response.status).toBe(204);
    }
    expect(info).not.toHaveBeenCalled();
  });
});
