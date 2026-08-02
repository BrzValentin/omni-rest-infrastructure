import { describe, expect, it } from "vitest";
import { safeAdminReturnPath } from "./auth-contract";

describe("safeAdminReturnPath", () => {
  it.each(["/admin", "/admin/restaurant", "/admin/restaurant?tab=hours"])("keeps local owner paths %s", (path) => {
    expect(safeAdminReturnPath(path)).toBe(path);
  });

  it.each([undefined, "", "//evil.test", "/administer", "/%61dmin/../evil", "/admin\\evil", "%E0%A4%A"])("rejects unsafe return path %s", (path) => {
    expect(safeAdminReturnPath(path)).toBe("/admin");
  });
});
