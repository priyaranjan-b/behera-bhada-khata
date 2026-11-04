import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, fakes, payment, resetFakes } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { getEarnings } = await import("@/server/services/earnings");

const ctx = { ownerId: OWNER_ID };

beforeEach(() => {
  resetFakes();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-20T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getEarnings", () => {
  it("defaults to the last 12 months ending this month", async () => {
    const view = await getEarnings(ctx);
    expect(view).toMatchObject({ from: "2025-04-01", to: "2026-03-01" });
    expect(view.months).toHaveLength(12);
    expect(fakes.owner.maintenance.monthly).toHaveBeenLastCalledWith("2025-04-01", "2026-03-01");
  });

  it("nets cash received against cash maintenance, leaving set-offs out of both (A22)", async () => {
    fakes.owner.payments.listForTenants.mockResolvedValue([
      payment({ amount: 3800 }),
      payment({ id: "00000000-0000-4000-8000-000000000202", mode: "set_off", amount: 1200 }),
    ]);
    fakes.owner.maintenance.monthly.mockResolvedValue([{ month: "2026-03-01", amount: 1700, cash: 500 }]);
    const { months, totals } = await getEarnings(ctx, { from: "2026-03", to: "2026-03" });
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({
      monthKey: "2026-03",
      billed: 5000,
      received: 3800,
      maintenance: 1700,
      maintenanceCash: 500,
      netCash: 3300,
    });
    expect(totals.netCash).toBe(3300);
  });

  it("refuses a malformed month, and keeps at most 24 months", async () => {
    await expect(getEarnings(ctx, { from: "March" })).rejects.toMatchObject({ status: 400 });
    const view = await getEarnings(ctx, { from: "2023-01", to: "2026-03" });
    expect(view.months).toHaveLength(24);
  });
});
