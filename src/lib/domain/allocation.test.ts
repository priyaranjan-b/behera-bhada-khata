import { describe, expect, it } from "vitest";
import { suggestAllocations, summarizeBalance } from "./allocation";

const periods = [
  { id: "mar", period_month: "2026-03-01", amount_due: "5000.00", amount_allocated: "0.00" },
  { id: "jan", period_month: "2026-01-01", amount_due: "5000.00", amount_allocated: "4000.00" },
  { id: "feb", period_month: "2026-02-01", amount_due: "5000.00", amount_allocated: "0.00" },
];

describe("suggestAllocations", () => {
  it("fills the oldest outstanding month first", () => {
    const result = suggestAllocations(periods, 7000.5);
    expect(result.map((r) => [r.rentPeriodId, r.amountAllocated])).toEqual([
      ["jan", 1000],
      ["feb", 5000],
      ["mar", 1000.5],
    ]);
  });

  it("never allocates more than the payment", () => {
    const total = suggestAllocations(periods, 0.3).reduce((s, r) => s + r.amountAllocated, 0);
    expect(total).toBeCloseTo(0.3, 10);
    expect(suggestAllocations(periods, 0)).toEqual([]);
  });
});

describe("summarizeBalance", () => {
  it("counts only months that have ended; this month and later aren't due yet", () => {
    expect(summarizeBalance(periods, "2026-03-01")).toEqual({ totalOutstanding: 6000, overdueMonths: 2, notYetDue: 5000 });
  });

  it("owes nothing yet when only the current and future months are unpaid", () => {
    expect(summarizeBalance(periods, "2026-01-01")).toEqual({ totalOutstanding: 0, overdueMonths: 0, notYetDue: 11000 });
  });

  it("counts every unpaid month once they've all ended", () => {
    expect(summarizeBalance(periods, "2026-04-01")).toEqual({ totalOutstanding: 11000, overdueMonths: 3, notYetDue: 0 });
  });
});
