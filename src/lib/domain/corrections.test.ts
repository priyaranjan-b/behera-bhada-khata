import { describe, expect, it } from "vitest";
import { CORRECTION_ACTIONS } from "@/lib/types";
import { CORRECTION_ACTION_LABELS, moveOutNeedsPin, moveOutPinFrom, wrongPinMessage } from "./corrections";

describe("corrections PIN rules", () => {
  // 18 Nov 2026, 10:00 in Kolkata.
  const now = new Date("2026-11-18T04:30:00Z");

  it("lets a move-out from the first of last month through without the PIN", () => {
    expect(moveOutPinFrom(now)).toBe("2026-10-01");
    expect(moveOutNeedsPin("2026-10-01", now)).toBe(false);
    expect(moveOutNeedsPin("2026-11-30", now)).toBe(false);
    expect(moveOutNeedsPin("2026-09-30", now)).toBe(true);
  });

  it("counts the month in the app's time zone, not UTC", () => {
    // 1 Dec 2026, 00:30 in Kolkata is still 30 Nov in UTC.
    expect(moveOutPinFrom(new Date("2026-11-30T19:00:00Z"))).toBe("2026-11-01");
  });

  it("names every action and says how many tries are left", () => {
    expect(Object.keys(CORRECTION_ACTION_LABELS).sort()).toEqual([...CORRECTION_ACTIONS].sort());
    expect(wrongPinMessage(3)).toBe("Wrong PIN. 3 tries left before corrections lock.");
    expect(wrongPinMessage(1)).toBe("Wrong PIN. 1 try left before corrections lock.");
    expect(wrongPinMessage(0)).toMatch(/locked/);
    expect(wrongPinMessage(0, "18/11/2026 16:20")).toBe("Wrong PIN. Corrections are locked until 18/11/2026 16:20.");
  });
});
