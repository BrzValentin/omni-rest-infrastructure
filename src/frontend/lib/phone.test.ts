import { describe, expect, it } from "vitest";
import { buildTelUri, isE164 } from "./phone";

describe("telephone URI policy", () => {
  it.each(["+12045550123", "+442079460018", "+380501234567"])("accepts valid E.164 %s", (number) => {
    expect(isE164(number)).toBe(true);
    expect(buildTelUri(number)).toBe(`tel:${number}`);
  });

  it.each(["", "2045550123", "+1 204 555 0123", "+012345678", "+123", "+1234567890123456"])("rejects invalid telephone input %s", (number) => {
    expect(isE164(number)).toBe(false);
    expect(buildTelUri(number)).toBeNull();
  });
});
