import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, fakes, resetFakes, tenant } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { getPaymentsPage, getPaymentsPaidDirect } = await import("@/server/services/paymentsReport");

const ctx = { ownerId: OWNER_ID };

// The grid and its totals run in SQL (payments_page, 0026): their rules are
// covered in test/schema.test.ts. Here: the days, the query mapping, the
// shapes, and Govt rent paid direct.
describe("Payments", () => {
  beforeEach(() => {
    resetFakes();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T06:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("defaults to last month and asks the database for one page, as database columns", async () => {
    const page = await getPaymentsPage(ctx);
    expect(page).toMatchObject({ from: "2026-10-01", to: "2026-10-31", total: 0, page: 0 });
    expect(page.totals).toEqual({ amount: 0, count: 0, byMode: { cash: 0, bank_transfer: 0, upi: 0, cheque: 0, other: 0 } });
    expect(fakes.owner.payments.page).toHaveBeenLastCalledWith({
      from: "2026-10-01",
      to: "2026-10-31",
      search: undefined,
      filters: [],
      logic: "and",
      sort: "payment_date",
      dir: "desc",
      page: 0,
      pageSize: 10,
    });
  });

  it("maps the grid's fields to columns and keeps the days asked for", async () => {
    await getPaymentsPage(ctx, {
      from: "2026-10-20",
      to: "2026-10-05",
      q: "upi",
      sort: "amount",
      dir: "asc",
      filters: JSON.stringify([{ field: "note", operator: "contains", value: "advance" }]),
    });
    expect(fakes.owner.payments.page).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: "2026-10-05",
        to: "2026-10-20",
        search: "upi",
        sort: "amount",
        dir: "asc",
        filters: [{ field: "note", operator: "contains", value: "advance" }],
      })
    );
  });

  it("rejects a malformed date or sort", async () => {
    await expect(getPaymentsPage(ctx, { from: "10/10/2026" })).rejects.toMatchObject({ status: 400 });
    await expect(getPaymentsPage(ctx, { sort: "note" })).rejects.toMatchObject({ status: 400 });
    await expect(getPaymentsPaidDirect(ctx, { to: "2026-13-01" })).rejects.toMatchObject({ status: 400 });
  });

  it("counts Govt rent paid direct for the rent months the days touch, up to this month", async () => {
    const GOVT = "00000000-0000-4000-8000-000000000102";
    fakes.owner.tenants.list.mockResolvedValue([
      tenant(),
      tenant({ id: GOVT, name: "Post Office", tenant_kind: "government", rent_tracked: false, billing_start: null, lease_start: "2022-01-01" }),
    ]);
    fakes.owner.rentRates.listForTenants.mockResolvedValue([
      { id: 9, tenant_id: GOVT, effective_month: "2022-01-01", monthly_amount: "5300.00", created_at: "", recorded_by: null },
    ]);
    expect(await getPaymentsPaidDirect(ctx)).toEqual({ amount: 5300, months: 1, tenants: 1 });
    // 15 Sep - 5 Oct touches September and October.
    expect(await getPaymentsPaidDirect(ctx, { from: "2026-09-15", to: "2026-10-05" })).toEqual({ amount: 10600, months: 2, tenants: 1 });
    // Not ahead of this month.
    expect(await getPaymentsPaidDirect(ctx, { from: "2026-12-01", to: "2026-12-31" })).toEqual({ amount: 0, months: 0, tenants: 0 });
  });
});
