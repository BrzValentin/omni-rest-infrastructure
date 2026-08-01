import { describe, expect, it } from "vitest";
import { adminReturnPath } from "./proxy";

describe("admin request path handoff", () => {
  it("preserves the exact protected path and query", () => {
    expect(adminReturnPath({ nextUrl: new URL("https://menu.localhost/admin/restaurant/preview?from=hours%20today") } as never))
      .toBe("/admin/restaurant/preview?from=hours%20today");
  });

  it("rejects a non-admin path", () => {
    expect(adminReturnPath({ nextUrl: new URL("https://menu.localhost/elsewhere?next=//evil.test") } as never)).toBe("/admin");
  });
});
