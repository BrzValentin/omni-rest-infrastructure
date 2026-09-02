import { describe, expect, it } from "vitest";

import { classify, kindForStatus, upstreamProblemResponse } from "./api-error";

describe("kindForStatus", () => {
  it("maps every status band this app can produce", () => {
    // `0` is the codebase-wide sentinel for "no response at all" and must stay network, not server.
    expect(kindForStatus(0)).toBe("network");
    expect(kindForStatus(404)).toBe("notFound");
    expect(kindForStatus(408)).toBe("timeout");
    expect(kindForStatus(504)).toBe("timeout");
    expect(kindForStatus(401)).toBe("denied");
    expect(kindForStatus(403)).toBe("denied");
    expect(kindForStatus(400)).toBe("validation");
    expect(kindForStatus(409)).toBe("validation");
    expect(kindForStatus(422)).toBe("validation");
    expect(kindForStatus(500)).toBe("server");
    expect(kindForStatus(502)).toBe("server");
    expect(kindForStatus(429)).toBe("unexpected");
  });
});

describe("classify", () => {
  it("reads a Response without consuming its body", async () => {
    const response = new Response(JSON.stringify({ code: "gone" }), { status: 404 });
    const failure = classify(response);

    expect(failure).toMatchObject({ kind: "notFound", status: 404 });
    // A body read twice throws, so `classify` must never touch the stream itself.
    await expect(response.json()).resolves.toEqual({ code: "gone" });
  });

  it("merges an already-parsed problem body into a Response result", () => {
    const failure = classify(new Response(null, { status: 403 }), { code: "forbidden", detail: "No membership." });

    expect(failure.kind).toBe("denied");
    expect(failure.problem).toEqual({ status: 403, code: "forbidden", detail: "No membership." });
  });

  it("treats a fetch TypeError as a network failure with the status-0 sentinel", () => {
    expect(classify(new TypeError("Failed to fetch"))).toMatchObject({ kind: "network", status: 0 });
  });

  it("treats an aborted or timed-out request as a timeout", () => {
    const timeout = new Error("The operation timed out.");
    timeout.name = "TimeoutError";
    const aborted = new Error("The operation was aborted.");
    aborted.name = "AbortError";

    expect(classify(timeout).kind).toBe("timeout");
    expect(classify(aborted).kind).toBe("timeout");
  });

  it("reads Node errno codes for server-side transport faults", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const slow = Object.assign(new Error("socket hang up"), { code: "ETIMEDOUT" });

    expect(classify(refused).kind).toBe("network");
    expect(classify(slow).kind).toBe("timeout");
  });

  it("classifies a bare problem document by its own status", () => {
    expect(classify({ status: 500, code: "server_error" }).kind).toBe("server");
    expect(classify({ status: 400, errors: { name: ["too_long"] } }).kind).toBe("validation");
  });

  it("lets a platform problem code override an ambiguous status", () => {
    // A `502` cannot say whether the upstream refused or simply never answered; the code can.
    expect(classify({ status: 502, code: "upstream_timeout" }).kind).toBe("timeout");
    expect(classify({ status: 502, code: "upstream_unavailable" }).kind).toBe("server");
  });

  it("falls back to unexpected for anything it cannot recognise", () => {
    expect(classify(undefined)).toMatchObject({ kind: "unexpected", status: 0 });
    expect(classify("something went wrong").kind).toBe("unexpected");
    expect(classify(new Error("boom")).kind).toBe("unexpected");
  });
});

describe("upstreamProblemResponse", () => {
  it("answers an unreachable upstream with a 502 problem document that is never stored", async () => {
    const response = upstreamProblemResponse("unavailable");

    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ status: 502, code: "upstream_unavailable" });
  });

  it("answers a timed-out upstream with a 504 problem document", async () => {
    const response = upstreamProblemResponse("timeout");

    expect(response.status).toBe(504);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ status: 504, code: "upstream_timeout" });
  });

  it("produces a body that classifies back to the kind it describes", async () => {
    const problem = await upstreamProblemResponse("timeout").json();

    expect(classify(problem).kind).toBe("timeout");
  });
});
