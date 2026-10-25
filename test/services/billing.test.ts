import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, fakes, resetFakes, tenant } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { getBillingReport } = await import("@/server/services/billing");

const ctx = { ownerId: OWNER_ID };

describe("getBillingReport", () => {
  beforeEach(() => {
    resetFakes();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T06:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("defaults to this month, the latest billing period", async () => {
    const report = await getBillingReport(ctx);
    expect(report).toMatchObject({ from: "2026-10-01", to: "2026-10-01", latestMonth: "2026-10-01" });
    expect(fakes.owner.rentPeriods.listForTenants).toHaveBeenCalledWith(expect.any(Array), {
      months: { from: "2026-10-01", to: "2026-10-01" },
    });
  });

  it("lists each tenant's month with the receipts that paid it, and the cash received in the range", async () => {
    const report = await getBillingReport(ctx, { from: "2026-03", to: "2026-03" });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      tenantName: "Asha",
      periodMonth: "2026-03-01",
      monthLabel: "March 2026",
      amountDue: 5000,
      notYetDue: false,
      payments: [{ paymentId: "00000000-0000-4000-8000-000000000201", paymentDate: "2026-03-05", mode: "upi", amount: 5000 }],
    });
    expect(report.totals).toMatchObject({ billed: 5000 });
    expect(report.received).toEqual({ amount: 5000, payments: 1, paidDirect: 0 });
  });

  it("counts government rent paid direct as billed and collected, never owed", async () => {
    const GOVT = "00000000-0000-4000-8000-000000000102";
    fakes.owner.tenants.list.mockResolvedValue([
      tenant(),
      tenant({ id: GOVT, name: "Post Office", tenant_kind: "government", rent_tracked: false, billing_start: null, lease_start: "2022-01-01" }),
    ]);
    fakes.owner.rentRates.listForTenants.mockResolvedValue([
      { id: 9, tenant_id: GOVT, effective_month: "2022-01-01", monthly_amount: "5300.00", created_at: "", recorded_by: null },
    ]);
    fakes.owner.rentPeriods.listForTenants.mockResolvedValue([]);
    fakes.owner.payments.listForTenants.mockResolvedValue([]);

    const report = await getBillingReport(ctx, { from: "2026-09", to: "2026-10" });

    expect(report.rows.map((r) => [r.tenantName, r.periodMonth, r.amountDue, r.amountAllocated, r.paidDirect])).toEqual([
      ["Post Office", "2026-09-01", 5300, 5300, true],
      ["Post Office", "2026-10-01", 5300, 5300, true],
    ]);
    expect(report.totals).toMatchObject({ billed: 10600, collected: 10600, balance: 0, overdue: 0 });
    expect(report.received).toEqual({ amount: 10600, payments: 0, paidDirect: 10600 });
    expect(report.paidDirect).toEqual({ available: true, shown: true });

    // The "Include Govt paid direct" switch off: only rent the owner collects.
    const hidden = await getBillingReport(ctx, { from: "2026-09", to: "2026-10", paidDirect: "hide" });
    expect(hidden.rows).toEqual([]);
    expect(hidden.totals.billed).toBe(0);
    expect(hidden.received).toEqual({ amount: 0, payments: 0, paidDirect: 0 });
    expect(hidden.paidDirect).toEqual({ available: true, shown: false });
  });

  it("swaps a reversed range and rejects a malformed month", async () => {
    const report = await getBillingReport(ctx, { from: "2026-06", to: "2026-03" });
    expect([report.from, report.to]).toEqual(["2026-03-01", "2026-06-01"]);
    await expect(getBillingReport(ctx, { from: "March" })).rejects.toMatchObject({ status: 400 });
  });
});
