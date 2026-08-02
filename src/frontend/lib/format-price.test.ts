import { describe, expect, it, vi } from "vitest";

import { formatPrice } from "./format-price";

describe("formatPrice", () => {
  it("formats zero as numeric zero rather than Free", () => {
    const value = formatPrice("0.00", "en-CA", "CAD");
    expect(value).toContain("0.00");
    expect(value).not.toContain("Free");
  });

  it("preserves values larger than JavaScript safe integers", () => {
    const value = formatPrice("900719925474099312345.67", "en-CA", "CAD");
    expect(value.replace(/[^0-9]/g, "")).toContain("90071992547409931234567");
  });

  it("uses a safe fallback for invalid contract input", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(formatPrice("12.5", "en-CA", "CAD")).toBe("Price unavailable");
    expect(error).toHaveBeenCalledOnce();
  });
});
