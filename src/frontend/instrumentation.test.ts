import { describe, expect, it, vi } from "vitest";

import { onRequestError } from "./instrumentation";

function report(error: unknown) {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  onRequestError(
    error,
    { method: "GET" },
    { routePath: "/menu/[category]", routeType: "render", renderSource: "react-server-components" },
  );
  return { logged, payload: String(logged.mock.calls[0][1]) };
}

describe("onRequestError", () => {
  it("records what a report needs to be matched to a render", () => {
    const { payload } = report(Object.assign(new Error("boom"), { digest: "server-digest-1" }));
    const entry = JSON.parse(payload) as Record<string, unknown>;

    expect(entry).toMatchObject({
      route: "/menu/[category]",
      routeType: "render",
      method: "GET",
      digest: "server-digest-1",
      type: "Error",
    });
    expect(typeof entry.at).toBe("string");
  });

  it("writes nothing that identifies the tenant, the session, or the request body", () => {
    const error = Object.assign(new Error("boom"), { digest: "server-digest-1" });
    const { payload } = report(error);

    // `routePath` is the matched route pattern, never a resolved URL, so no host and no tenant is
    // written. Cookies carry the owner's session, and the body is their unsaved content.
    for (const forbidden of ["cookie", "host", "body", "authorization", "prairie"]) {
      expect(payload.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });

  it("never writes the error message or stack", () => {
    const { payload } = report(Object.assign(new Error("connection string leaked here"), { digest: "d" }));

    expect(payload).not.toContain("connection string leaked here");
    expect(payload).not.toContain("at Object");
  });

  it("survives a thrown value that is not an Error and carries no digest", () => {
    const { payload } = report("plain string failure");
    const entry = JSON.parse(payload) as Record<string, unknown>;

    expect(entry.digest).toBeNull();
    expect(entry.type).toBe("string");
    expect(payload).not.toContain("plain string failure");
  });
});
