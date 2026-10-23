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
  it("counts only past months as overdue", () => {
    expect(summarizeBalance(periods, "2026-03-01")).toEqual({ totalOutstanding: 11000, overdueMonths: 2 });
  });
});
