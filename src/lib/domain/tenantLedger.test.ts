import { describe, expect, it } from "vitest";
import { buildTenantLedger } from "./tenantLedger";

describe("buildTenantLedger", () => {
  it("runs the balance over confirmed entries only", () => {
    const rows = buildTenantLedger(
      [
        { id: "jan", period_month: "2026-01-01", amount_due: "5000.00" },
        { id: "feb", period_month: "2026-02-01", amount_due: "5000.00" },
      ],
      [
        { id: "p1", amount: "5000.00", payment_date: "2026-01-10", mode: "upi", note: null, status: "confirmed" },
        { id: "p2", amount: "5000.00", payment_date: "2026-02-10", mode: "cash", note: null, status: "pending" },
      ],
      [
        {
          id: "a1",
          delta_amount: "-500.00",
          reason: "Typo",
          status: "confirmed",
          created_at: "2026-01-20T05:00:00Z",
          confirmed_at: "2026-01-20T05:00:00Z",
        },
      ]
    );
    expect(rows.map((r) => [r.id, r.balance])).toEqual([
      ["charge-jan", 5000],
      ["payment-p1", 0],
      ["adjustment-a1", 500],
      ["charge-feb", 5500],
      ["payment-p2", 5500],
    ]);
    expect(rows[0].description).toBe("Rent due — January 2026");
  });
});
