import { describe, expect, it } from "vitest";
import {
  addMonthsToKey,
  currentMonthKey,
  dateKeyOf,
  formatDateKey,
  formatMonth,
  isDateKey,
  lastMonthKey,
  monthKeyFromParam,
  monthKeyOf,
  monthsBetween,
  todayKey,
  yearMonthOf,
  monthDayRange,
} from "./dates";

describe("dates (Asia/Kolkata)", () => {
  it("puts an early-morning IST instant on the IST day, not the UTC one", () => {
    // 2026-03-01 01:00 IST = 2026-02-28 19:30 UTC
    const instant = new Date("2026-02-28T19:30:00Z");
    expect(todayKey(instant)).toBe("2026-03-01");
    expect(currentMonthKey(instant)).toBe("2026-03-01");
    expect(dateKeyOf("2026-02-28T19:30:00Z")).toBe("2026-03-01");
  });

  it("does month arithmetic on keys across year boundaries", () => {
    expect(addMonthsToKey("2026-11-01", 2)).toBe("2027-01-01");
    expect(addMonthsToKey("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonthsToKey("2026-03-01", -15)).toBe("2024-12-01");
    expect(monthKeyOf("2026-07-19")).toBe("2026-07-01");
  });

  it("validates real calendar dates", () => {
    expect(isDateKey("2026-02-28")).toBe(true);
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("26-01-01")).toBe(false);
  });

  it("labels months the same whatever the runtime's own zone", () => {
    expect(formatMonth("2026-03-01")).toBe("March 2026");
    expect(formatMonth("2026-03-01", "short")).toBe("Mar 2026");
    expect(formatDateKey("2026-10-04")).toBe("4 Oct 2026");
  });
});

describe("month helpers", () => {
  it("converts between month keys and yyyy-MM", () => {
    expect(yearMonthOf("2026-10-01")).toBe("2026-10");
    expect(yearMonthOf("2026-10-24")).toBe("2026-10");
    expect(monthKeyOf(yearMonthOf("2026-10-24"))).toBe("2026-10-01");
  });

  it("reads a ?month= param, falling back to last month", () => {
    const now = new Date("2026-10-15T06:00:00Z");
    expect(monthKeyFromParam("2026-07", now)).toBe("2026-07-01");
    expect(monthKeyFromParam(undefined, now)).toBe("2026-09-01");
    expect(monthKeyFromParam("2026-13", now)).toBe("2026-09-01");
    expect(monthKeyFromParam("2026-07-01", now)).toBe("2026-09-01");
  });

  it("gives last month in the app time zone, across a year end", () => {
    expect(lastMonthKey(new Date("2026-10-15T06:00:00Z"))).toBe("2026-09-01");
    // 1 Jan 00:30 in Kolkata is still 31 Dec in UTC.
    expect(lastMonthKey(new Date("2025-12-31T19:00:00Z"))).toBe("2025-12-01");
    expect(lastMonthKey(new Date("2026-01-10T06:00:00Z"))).toBe("2025-12-01");
  });

  it("counts whole months between month keys", () => {
    expect(monthsBetween("2026-10-01", "2026-10-01")).toBe(0);
    expect(monthsBetween("2025-11-01", "2026-02-01")).toBe(3);
    expect(monthsBetween("2026-02-01", "2025-11-01")).toBe(0);
  });
});

describe("monthDayRange", () => {
  it("gives the first and last day of the month, leap years included", () => {
    expect(monthDayRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthDayRange("2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthDayRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthDayRange("2026-12-01")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});
