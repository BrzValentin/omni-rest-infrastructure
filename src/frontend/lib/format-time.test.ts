import { describe, expect, it } from "vitest";

import { formatInterval, formatTime } from "./format-time";

describe("formatTime", () => {
  it("shows midnight as 12:00 AM rather than 0:00 AM", () => {
    expect(formatTime("00:00")).toBe("12:00 AM");
  });

  it("shows noon as 12:00 PM rather than 12:00 AM", () => {
    expect(formatTime("12:00")).toBe("12:00 PM");
  });

  it("keeps the half hour after midnight in the AM and the half hour after noon in the PM", () => {
    expect(formatTime("00:30")).toBe("12:30 AM");
    expect(formatTime("12:30")).toBe("12:30 PM");
  });

  it("converts afternoon hours to a 12-hour clock without a leading zero", () => {
    expect(formatTime("17:00")).toBe("5:00 PM");
    expect(formatTime("13:30")).toBe("1:30 PM");
  });

  it("drops the leading zero from morning hours and keeps the minutes", () => {
    expect(formatTime("09:30")).toBe("9:30 AM");
    expect(formatTime("11:59")).toBe("11:59 AM");
  });

  it("accepts the HH:mm:ss form the API returns and ignores the seconds", () => {
    expect(formatTime("09:30:00")).toBe("9:30 AM");
    expect(formatTime("17:00:00")).toBe("5:00 PM");
  });

  it("formats the last minute of the day as 11:59 PM", () => {
    expect(formatTime("23:59")).toBe("11:59 PM");
    expect(formatTime("23:59:59")).toBe("11:59 PM");
  });

  it("separates the day period with a plain ASCII space, never a narrow no-break space", () => {
    expect(formatTime("17:00")).toBe("5:00 PM");
    // Built from its code point so the character under test is unmistakable in the source.
    expect(formatTime("17:00")).not.toContain(String.fromCodePoint(0x202f));
    expect(formatTime("17:00")).not.toContain(String.fromCodePoint(0x00a0));
  });

  it("returns malformed input unchanged instead of throwing, so one bad value cannot break a page", () => {
    for (const malformed of ["", "9:00", "24:00", "12:60", "12:00:60", "noon", "12:00 PM", "T09:00"]) {
      expect(formatTime(malformed)).toBe(malformed);
    }
  });
});

describe("formatInterval", () => {
  it("joins the opening and closing times with an en dash", () => {
    expect(formatInterval({ opensAt: "09:00:00", closesAt: "17:00:00", closesNextDay: false })).toBe("9:00 AM–5:00 PM");
  });

  it("appends the next-day suffix when the period closes after midnight", () => {
    expect(formatInterval({ opensAt: "17:00", closesAt: "01:00", closesNextDay: true })).toBe("5:00 PM–1:00 AM next day");
  });

  it("treats a missing closesNextDay as a same-day period", () => {
    expect(formatInterval({ opensAt: "11:00", closesAt: "14:00" })).toBe("11:00 AM–2:00 PM");
  });
});
