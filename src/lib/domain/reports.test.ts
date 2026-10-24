import { describe, expect, it } from "vitest";
import type { RentPeriod } from "@/lib/types";
import { agingGroups, agingOf, buildBillingCollectionTrend, buildMonthlyReport, compareAging } from "./reports";

const period = (tenant_id: string, period_month: string, amount_allocated: string): RentPeriod => ({
  id: `${tenant_id}-${period_month}`,
  tenant_id,
  period_month,
  amount_due: "5000.00",
  amount_allocated,
  status: amount_allocated === "5000.00" ? "paid" : amount_allocated === "0.00" ? "pending" : "partially_paid",
  created_at: "2026-01-01T00:00:00Z",
});

describe("buildMonthlyReport", () => {
  it("sums the month and flags tenants with overdue months", () => {
    const report = buildMonthlyReport(
      [
        { id: "a", name: "Asha", propertyName: "P" },
        { id: "b", name: "Bimal", propertyName: "P" },
      ],
      new Map([
        ["a", [period("a", "2026-02-01", "5000.00"), period("a", "2026-03-01", "2000.00")]],
        ["b", [period("b", "2026-02-01", "0.00"), period("b", "2026-03-01", "0.00")]],
      ]),
      "2026-03-01",
      "2026-03-01"
    );
    // Outstanding stops at the end of last month: only Bimal's unpaid February counts, not March.
    expect(report).toMatchObject({ expected: 10000, collected: 2000, outstanding: 5000, overdueTenantCount: 1 });
  });
});

describe("buildBillingCollectionTrend", () => {
  it("counts adjustments in the IST month they were confirmed", () => {
    const trend = buildBillingCollectionTrend(
      [period("a", "2026-03-01", "0.00")],
      [{ amount: "1000.00", payment_date: "2026-02-28" }],
      // 01:00 IST on 1 March
      [{ delta_amount: "-200.00", confirmed_at: "2026-02-28T19:30:00Z" }],
      ["2026-02", "2026-03"]
    );
    expect(trend).toEqual([
      { monthKey: "2026-02", label: "Feb 2026", billed: 0, collected: 1000 },
      { monthKey: "2026-03", label: "Mar 2026", billed: 5000, collected: -200 },
    ]);
  });
});

describe("aging", () => {
  const today = "2026-10-01";
  const unpaid = (month: string, allocated = "0.00") => period("a", month, allocated);

  it("buckets unpaid months by how long ago they ended and ignores this month", () => {
    const aging = agingOf(
      [
        unpaid("2026-02-01"), // 8 months ago
        unpaid("2026-05-01", "5000.00"), // paid
        unpaid("2026-06-01", "1000.00"), // 4 months ago, 4000 left
        unpaid("2026-08-01"), // 2
        unpaid("2026-09-01"), // 1
        unpaid("2026-10-01"), // this month: not due yet
      ],
      today
    );
    expect(aging).toEqual({
      overdueMonths: 4,
      totalOutstanding: 19000,
      oldestUnpaidMonth: "2026-02-01",
      byAge: { m1: 5000, m2to3: 5000, m4to6: 4000, m7plus: 5000 },
    });
  });

  it("is empty for a tenant who is up to date", () => {
    expect(agingOf([unpaid("2026-09-01", "5000.00"), unpaid("2026-10-01")], today)).toMatchObject({
      overdueMonths: 0,
      totalOutstanding: 0,
      oldestUnpaidMonth: null,
    });
  });

  it("sorts by months behind, then amount, and groups tenants by months behind", () => {
    const one = agingOf([unpaid("2026-09-01")], today);
    const twoSmall = agingOf([unpaid("2026-08-01", "4000.00"), unpaid("2026-09-01")], today);
    const twoBig = agingOf([unpaid("2026-08-01"), unpaid("2026-09-01")], today);
    const seven = agingOf(
      ["2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"].map((m) =>
        unpaid(m)
      ),
      today
    );
    expect([one, twoSmall, seven, twoBig].sort(compareAging)).toEqual([seven, twoBig, twoSmall, one]);
    expect(agingGroups([one, twoSmall, twoBig, seven])).toEqual([
      { key: "m1", label: "1 month", tenantCount: 1, outstanding: 5000 },
      { key: "m2to3", label: "2–3 months", tenantCount: 2, outstanding: 16000 },
      { key: "m4to6", label: "4–6 months", tenantCount: 0, outstanding: 0 },
      { key: "m7plus", label: "Over 6 months", tenantCount: 1, outstanding: 35000 },
    ]);
  });
});
