import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RentPeriod } from "@/lib/types";
import { OWNER_ID, fakes, payment, resetFakes, tenant } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { getDefaultersReport } = await import("@/server/services/dashboard");

const ctx = { ownerId: OWNER_ID };

const period = (tenant_id: string, period_month: string, amount_allocated = "0.00"): RentPeriod => ({
  id: `${tenant_id}-${period_month}`,
  tenant_id,
  period_month,
  amount_due: "5000.00",
  amount_allocated,
  status: amount_allocated === "0.00" ? "pending" : "partially_paid",
  created_at: "2026-01-01T00:00:00Z",
});

describe("getDefaultersReport", () => {
  beforeEach(() => {
    resetFakes();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T06:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("lists tenants behind on ended months, most months behind first", async () => {
    fakes.owner.tenants.list.mockResolvedValue([
      tenant(),
      tenant({ id: "tenant-2", name: "Bimal", business_name: "Bimal Stores" }),
      tenant({ id: "tenant-3", name: "Chitra" }),
      tenant({ id: "tenant-4", name: "Dev", status: "inactive", moved_out_on: "2026-05-31" }),
    ]);
    fakes.owner.rentPeriods.listForTenants.mockResolvedValue([
      period("tenant-1", "2026-09-01"),
      period("tenant-2", "2026-07-01", "1000.00"),
      period("tenant-2", "2026-09-01"),
      // This month isn't due yet, so Chitra isn't behind.
      period("tenant-3", "2026-10-01"),
      period("tenant-4", "2026-04-01"),
      period("tenant-4", "2026-05-01"),
    ]);
    fakes.owner.payments.listForTenants.mockResolvedValue([
      payment({ tenant_id: "tenant-2", payment_date: "2026-07-03" }),
      payment({ id: "payment-2", tenant_id: "tenant-2", payment_date: "2026-08-20" }),
    ]);

    const report = await getDefaultersReport(ctx);

    expect(report.asOfMonth).toBe("2026-09-01");
    expect(report.totalOutstanding).toBe(24000);
    // Two months each: Dev owes more, so comes first.
    expect(report.rows.map((r) => [r.displayName, r.overdueMonths, r.totalOutstanding])).toEqual([
      ["Dev", 2, 10000],
      ["Bimal Stores", 2, 9000],
      ["Asha", 1, 5000],
    ]);
    expect(report.rows.find((r) => r.tenantId === "tenant-2")).toMatchObject({
      contactName: "Bimal",
      oldestUnpaidMonth: "2026-07-01",
      lastPaymentDate: "2026-08-20",
      byAge: { m1: 5000, m2to3: 4000, m4to6: 0, m7plus: 0 },
    });
    expect(report.rows.find((r) => r.tenantId === "tenant-4")).toMatchObject({
      movedOut: true,
      lastPaymentDate: null,
      byAge: { m4to6: 10000 },
    });
    expect(report.groups.map((g) => [g.key, g.tenantCount, g.outstanding])).toEqual([
      ["m1", 1, 5000],
      ["m2to3", 2, 19000],
      ["m4to6", 0, 0],
      ["m7plus", 0, 0],
    ]);
  });
});
