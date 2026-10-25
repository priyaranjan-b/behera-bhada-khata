import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RentPeriod } from "@/lib/types";
import { OWNER_ID, fakes, resetFakes, tenant } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { getAttention, getOverviewMonth, getOverviewTrend, getPortfolio } = await import("@/server/services/overview");
const { getPaidDirectState } = await import("@/server/services/paidDirect");

const ctx = { ownerId: OWNER_ID };
const ASHA = "00000000-0000-4000-8000-000000000101";
const GOVT = "00000000-0000-4000-8000-000000000102";
const DRAFT = "00000000-0000-4000-8000-000000000103";

const period = (tenant_id: string, period_month: string, amount_allocated = "0.00"): RentPeriod => ({
  id: `${tenant_id}-${period_month}`,
  tenant_id,
  period_month,
  amount_due: "5000.00",
  amount_allocated,
  status: amount_allocated === "0.00" ? "pending" : "partially_paid",
  created_at: "2026-01-01T00:00:00Z",
});

describe("Overview sections", () => {
  beforeEach(() => {
    resetFakes();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T06:00:00Z"));
    fakes.owner.tenants.list.mockResolvedValue([
      tenant({ deposit_amount: "10000.00" }),
      tenant({ id: GOVT, name: "Block Office", tenant_kind: "government", rent_tracked: false, billing_start: null }),
      tenant({ id: DRAFT, name: "Mohan", status: "draft", billing_start: null, deposit_amount: "2000.00" }),
    ]);
    fakes.owner.rentPeriods.listForTenants.mockResolvedValue([
      period(ASHA, "2026-09-01"),
      period(ASHA, "2026-10-01"),
      period(ASHA, "2026-11-01", "5000.00"),
    ]);
  });
  afterEach(() => vi.useRealTimers());

  it("month: tops up only billed tenants, then splits the month by site and tenant type", async () => {
    const month = await getOverviewMonth(ctx, "2026-10");

    expect(fakes.system.rentPeriods.ensure).toHaveBeenCalledWith([ASHA], expect.any(String));
    expect(month.monthKey).toBe("2026-10-01");
    expect(month.sites).toEqual([
      { siteCode: "AC", siteName: "Arnapal Chakk Complex", expected: 5000, collected: 0, outstanding: 5000, collectionRate: 0 },
    ]);
    expect(month.kinds.map((k) => [k.kind, k.tenants, k.expected, k.paidDirectTenants])).toEqual([
      ["individual", 1, 5000, 0],
      ["business", 0, 0, 0],
      ["government", 1, 0, 1],
    ]);
  });

  it("paid-direct switch: available when a Govt tenant pays direct, shown unless hidden", async () => {
    expect(await getPaidDirectState(ctx)).toEqual({ available: true, shown: true });
    expect(await getPaidDirectState(ctx, { paidDirect: "hide" })).toEqual({ available: true, shown: false });
    // It needs only the tenant list: no rent-month top-up, no rent months.
    expect(fakes.system.rentPeriods.ensure).not.toHaveBeenCalled();
    expect(fakes.owner.rentPeriods.listForTenants).not.toHaveBeenCalled();
  });

  it("month: a malformed ?month= means the current month", async () => {
    expect((await getOverviewMonth(ctx, "2026-13")).monthKey).toBe("2026-10-01");
  });

  it("trend: ends this month, six months long", async () => {
    const { trend } = await getOverviewTrend(ctx);
    expect(trend.map((p) => p.monthKey)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  });

  it("attention: drafts, missing documents and unsigned receipts", async () => {
    const attention = await getAttention(ctx);
    expect(attention.map((a) => [a.kind, a.tenants.map((t) => t.displayName)])).toEqual([
      ["drafts", ["Mohan"]],
      ["noDocuments", ["Asha", "Block Office"]],
      // The fake payment hasn't been signed by the tenant (messaging is on in tests).
      ["unacknowledged", ["Asha"]],
    ]);
  });

  it("portfolio: rent roll, deposits and advances, Govt paid direct only when shown", async () => {
    const rate = (tenant_id: string, monthly_amount: string, id: number) => ({
      id,
      tenant_id,
      effective_month: "2026-01-01",
      monthly_amount,
      created_at: "",
      recorded_by: OWNER_ID,
    });
    fakes.owner.rentRates.listForTenants.mockResolvedValue([rate(ASHA, "5000.00", 1), rate(GOVT, "11000.00", 2)]);

    expect(await getPortfolio(ctx)).toEqual({ rentRoll: 16000, depositsHeld: 12000, advancePaid: 5000, paidDirectRent: 11000 });
    expect(await getPortfolio(ctx, { paidDirect: "hide" })).toEqual({
      rentRoll: 5000,
      depositsHeld: 12000,
      advancePaid: 5000,
      paidDirectRent: 0,
    });
    const hidden = await getOverviewMonth(ctx, "2026-10", { paidDirect: "hide" });
    // Tenant types follows the same switch.
    expect(hidden.kinds.find((k) => k.kind === "government")).toMatchObject({ paidDirectTenants: 0, paidDirectRent: 0 });
    expect((await getOverviewMonth(ctx, "2026-10")).kinds.find((k) => k.kind === "government")).toMatchObject({
      paidDirectTenants: 1,
      paidDirectRent: 11000,
    });
  });
});
