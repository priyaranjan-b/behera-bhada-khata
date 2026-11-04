import { describe, expect, it } from "vitest";
import { buildEarnings, earningsRange, earningsTotals } from "./earnings";

// The paint example (A22): October rent ₹5,000, the tenant hands over ₹3,800
// and keeps ₹1,200 for paint the owner bought from them, recorded as a
// maintenance expense the set-off paid for. Plus a ₹500 plumber paid in cash.
const october = buildEarnings({
  monthKeys: ["2026-09", "2026-10"],
  periods: [
    { period_month: "2026-09-01", amount_due: 5000, amount_allocated: 5000 },
    { period_month: "2026-10-01", amount_due: 5000, amount_allocated: 5000 },
  ],
  // Cash only: the ₹1,200 set-off is not here.
  cashPayments: [
    { amount: 5000, payment_date: "2026-09-04" },
    { amount: 3800, payment_date: "2026-10-03" },
  ],
  adjustments: [],
  maintenance: [{ month: "2026-10-01", amount: 1700, cash: 500 }],
});

describe("buildEarnings", () => {
  it("nets the rent month against all maintenance, and cash against cash maintenance only", () => {
    expect(october[1]).toEqual({
      monthKey: "2026-10",
      label: "Oct 2026",
      billed: 5000,
      collected: 5000,
      received: 3800,
      maintenance: 1700,
      maintenanceCash: 500,
      // Rent month: the paint cost ₹1,200 of rent.
      netCollected: 3300,
      // Cash: ₹3,800 in, ₹500 out - the ₹1,200 is never subtracted twice.
      netCash: 3300,
      expenseRatio: 34,
    });
  });

  it("shows a month with no maintenance at full rent, and none collected as no ratio", () => {
    expect(october[0]).toMatchObject({ netCollected: 5000, netCash: 5000, maintenance: 0, expenseRatio: 0 });
    const empty = buildEarnings({ monthKeys: ["2026-11"], periods: [], cashPayments: [], adjustments: [], maintenance: [] });
    expect(empty[0]).toMatchObject({ collected: 0, netCollected: 0, expenseRatio: null });
  });

  it("counts arrears paid late as received in the month paid, but collected for their own month", () => {
    const [sep, oct] = buildEarnings({
      monthKeys: ["2026-09", "2026-10"],
      periods: [{ period_month: "2026-09-01", amount_due: 5000, amount_allocated: 5000 }],
      cashPayments: [{ amount: 5000, payment_date: "2026-10-10" }],
      adjustments: [],
      maintenance: [],
    });
    expect([sep.collected, sep.received, oct.collected, oct.received]).toEqual([5000, 0, 0, 5000]);
  });
});

describe("earningsTotals", () => {
  it("adds the months, with the ratio of the totals", () => {
    expect(earningsTotals(october)).toEqual({
      billed: 10000,
      collected: 10000,
      received: 8800,
      maintenance: 1700,
      maintenanceCash: 500,
      netCollected: 8300,
      netCash: 8300,
      expenseRatio: 17,
    });
  });
});

describe("earningsRange", () => {
  const limits = { maxMonths: 24, defaultMonths: 12 };
  const now = new Date("2026-03-20T06:00:00Z");
  it("defaults to the last 12 months ending this month, else reads the URL like Billing", () => {
    expect(earningsRange({}, limits, now)).toEqual({ from: "2025-04-01", to: "2026-03-01" });
    expect(earningsRange({ from: "junk" }, limits, now)).toEqual({ from: "2025-04-01", to: "2026-03-01" });
    expect(earningsRange({ from: "2026-01" }, limits, now)).toEqual({ from: "2026-01-01", to: "2026-01-01" });
    expect(earningsRange({ from: "2023-01", to: "2026-03" }, limits, now)).toEqual({ from: "2023-01-01", to: "2024-12-01" });
  });
});
