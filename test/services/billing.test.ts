import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, fakes, resetFakes, tenant } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { getBillingPage, getBillingReceived, getBillingTotals } = await import("@/server/services/billing");

const ctx = { ownerId: OWNER_ID };

// The grid and the totals run in SQL (billing_page / billing_totals, 0021):
// their rules are covered in test/schema.test.ts. Here: the range, the query
// mapping, the shapes, and the cash received.
describe("Billing", () => {
  beforeEach(() => {
    resetFakes();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T06:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("defaults to this month and asks the database for one page, as database columns", async () => {
    const page = await getBillingPage(ctx);
    expect(page).toMatchObject({ from: "2026-10-01", to: "2026-10-01", total: 1, all: 1, page: 0 });
    expect(fakes.owner.billing.page).toHaveBeenLastCalledWith({
      from: "2026-10-01",
      to: "2026-10-01",
      paidDirect: true,
      show: "all",
      search: undefined,
      filters: [],
      logic: "and",
      sort: "amount_allocated",
      dir: "desc",
      page: 0,
      pageSize: 10,
    });

    await getBillingPage(ctx, {
      from: "2026-03",
      to: "2026-05",
      paidDirect: "hide",
      show: "unpaid",
      q: "asha",
      sort: "status",
      dir: "asc",
      filters: JSON.stringify([{ field: "payments", operator: "contains", value: "2026/03" }]),
      page: "2",
      pageSize: "25",
    });
    expect(fakes.owner.billing.page).toHaveBeenLastCalledWith({
      from: "2026-03-01",
      to: "2026-05-01",
      paidDirect: false,
      show: "unpaid",
      search: "asha",
      filters: [{ field: "payments", operator: "contains", value: "2026/03" }],
      logic: "and",
      sort: "status",
      dir: "asc",
      page: 2,
      pageSize: 25,
    });
  });

  it("returns each month with the receipts that paid it, and the range's totals", async () => {
    const page = await getBillingPage(ctx, { from: "2026-03", to: "2026-03" });
    expect(page.rows[0]).toEqual({
      id: "period-mar",
      tenantId: "00000000-0000-4000-8000-000000000101",
      tenantName: "Asha",
      propertyName: "Tower 1",
      unitCodes: ["AC-T1-G01"],
      periodMonth: "2026-03-01",
      monthLabel: "March 2026",
      amountDue: 5000,
      amountAllocated: 5000,
      balance: 0,
      status: "paid",
      notYetDue: false,
      payments: [
        { paymentId: "00000000-0000-4000-8000-000000000201", receiptNo: "2026/03/001", paymentDate: "2026-03-05", mode: "upi", amount: 5000 },
      ],
      paidDirect: false,
    });
    expect(await getBillingTotals(ctx, { from: "2026-03", to: "2026-03", paidDirect: "hide" })).toEqual({
      billed: 5000,
      collected: 5000,
      balance: 0,
      overdue: 0,
      collectionRate: 100,
      tenants: 1,
    });
    expect(fakes.owner.billing.totals).toHaveBeenLastCalledWith({ from: "2026-03-01", to: "2026-03-01", paidDirect: false });
  });

  it("counts the cash received in the range, government rent paid direct included unless hidden", async () => {
    expect(await getBillingReceived(ctx, { from: "2026-03", to: "2026-03" })).toEqual({ amount: 5000, payments: 1, paidDirect: 0 });

    const GOVT = "00000000-0000-4000-8000-000000000102";
    fakes.owner.tenants.list.mockResolvedValue([
      tenant(),
      tenant({ id: GOVT, name: "Post Office", tenant_kind: "government", rent_tracked: false, billing_start: null, lease_start: "2022-01-01" }),
    ]);
    fakes.owner.rentRates.listForTenants.mockResolvedValue([
      { id: 9, tenant_id: GOVT, effective_month: "2022-01-01", monthly_amount: "5300.00", created_at: "", recorded_by: null },
    ]);
    fakes.owner.payments.listForTenants.mockResolvedValue([]);
    expect(await getBillingReceived(ctx, { from: "2026-09", to: "2026-10" })).toEqual({ amount: 10600, payments: 0, paidDirect: 10600 });
    expect(await getBillingReceived(ctx, { from: "2026-09", to: "2026-10", paidDirect: "hide" })).toEqual({
      amount: 0,
      payments: 0,
      paidDirect: 0,
    });
  });

  it("swaps a reversed range and rejects a malformed month or query", async () => {
    expect(await getBillingPage(ctx, { from: "2026-06", to: "2026-03" })).toMatchObject({ from: "2026-03-01", to: "2026-06-01" });
    await expect(getBillingPage(ctx, { from: "March" })).rejects.toMatchObject({ status: 400 });
    await expect(getBillingPage(ctx, { show: "owed" })).rejects.toMatchObject({ status: 400 });
    await expect(getBillingPage(ctx, { sort: "id" })).rejects.toMatchObject({ status: 400 });
    await expect(getBillingTotals(ctx, { from: "March" })).rejects.toMatchObject({ status: 400 });
    await expect(getBillingReceived(ctx, { from: "March" })).rejects.toMatchObject({ status: 400 });
  });
});
