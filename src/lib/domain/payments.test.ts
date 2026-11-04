import { describe, expect, it } from "vitest";
import { PAYMENT_MODES } from "@/lib/types";
import {
  cashOnly,
  isCashMode,
  PAYMENT_MODE_OPTIONS,
  dayRangeLabel,
  isPaymentMode,
  paymentModeLabel,
  recentDayPicks,
  resolveDayRange,
  shiftDayRange,
} from "./payments";

describe("payment modes", () => {
  it("labels every mode, never showing the raw value", () => {
    expect(paymentModeLabel("bank_transfer")).toBe("Bank transfer");
    expect(paymentModeLabel("upi")).toBe("UPI");
    expect(paymentModeLabel("something_new")).toBe("Other");
  });

  it("offers every mode once, in order", () => {
    expect(PAYMENT_MODE_OPTIONS.map((o) => o.value)).toEqual([...PAYMENT_MODES]);
  });

  it("recognises modes", () => {
    expect(isPaymentMode("cash")).toBe(true);
    expect(isPaymentMode("Cash")).toBe(false);
  });
});

describe("payments date range", () => {
  const now = new Date("2026-11-01T06:00:00Z");

  it("defaults to last month and swaps or caps what it's given", () => {
    expect(resolveDayRange({}, 731, now)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolveDayRange({ from: "2026-10-05" }, 731, now)).toEqual({ from: "2026-10-05", to: "2026-10-05" });
    expect(resolveDayRange({ from: "2026-10-20", to: "2026-10-05" }, 731, now)).toEqual({ from: "2026-10-05", to: "2026-10-20" });
    expect(resolveDayRange({ from: "2026-01-01", to: "2026-12-31" }, 10, now)).toEqual({ from: "2026-01-01", to: "2026-01-10" });
  });

  it("moves whole months by months and other ranges by their length", () => {
    expect(shiftDayRange({ from: "2026-02-01", to: "2026-02-28" }, 1)).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    expect(shiftDayRange({ from: "2026-01-01", to: "2026-02-28" }, -1)).toEqual({ from: "2025-11-01", to: "2025-12-31" });
    expect(shiftDayRange({ from: "2026-10-01", to: "2026-10-07" }, 1)).toEqual({ from: "2026-10-08", to: "2026-10-14" });
    expect(shiftDayRange({ from: "2026-12-30", to: "2026-12-31" }, 1)).toEqual({ from: "2027-01-01", to: "2027-01-02" });
  });

  it("labels whole months by name and other ranges by their dates", () => {
    expect(dayRangeLabel({ from: "2026-10-01", to: "2026-10-31" })).toBe("October 2026");
    expect(dayRangeLabel({ from: "2026-09-01", to: "2026-10-31" })).toBe("Sept 2026 – Oct 2026");
    expect(dayRangeLabel({ from: "2026-10-01", to: "2026-10-15" })).toBe("01/10/2026 – 15/10/2026");
    expect(dayRangeLabel({ from: "2026-10-05", to: "2026-10-05" })).toBe("05/10/2026");
  });
});

describe("recentDayPicks", () => {
  it("offers today and yesterday in IST, across a month end", () => {
    // 1 Nov 01:30 IST is still 31 Oct in UTC.
    expect(recentDayPicks(new Date("2026-10-31T20:00:00Z"))).toEqual([
      { label: "Today", value: "2026-11-01" },
      { label: "Yesterday", value: "2026-10-31" },
    ]);
  });
});

describe("cash vs set-off (A22)", () => {
  it("counts every mode as cash but a set-off", () => {
    expect(PAYMENT_MODES.filter((m) => !isCashMode(m))).toEqual(["set_off"]);
    const payments = [
      { mode: "cash", amount: 3800 },
      { mode: "set_off", amount: 1200 },
      { mode: "upi", amount: 500 },
    ];
    expect(cashOnly(payments).map((p) => p.amount)).toEqual([3800, 500]);
    expect(paymentModeLabel("set_off")).toBe("Set-off (deducted by tenant)");
  });
});
