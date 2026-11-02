// Parity: the Drizzle tenantAccountSummary must answer exactly what the SQL
// function it replaces, tenant_account_summary() (0022), answers - for the
// owner and for anyone else - and agree with summarizeBalance (D29).
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonthsToKey, currentMonthKey } from "@/lib/dates";
import { summarizeBalance } from "@/lib/domain/allocation";
import type { TenantAccountSummaryDb } from "@/lib/types";
import { inScope, type Scope } from "@/server/adapters/drizzle/client";
import { drizzleOwnerRepositories } from "@/server/adapters/drizzle/repositories/owner";
import { tenantAccountSummary } from "@/server/adapters/drizzle/queries/tenantAccountSummary";
import { asOwner, asStranger, createLedgerDb, OWNER, type LedgerDb } from "../fixtures";

let l: LedgerDb;
let partlyPaid: string;
let unbilled: string;
let government: string;
let governmentPaid: string;

beforeAll(async () => {
  l = await createLedgerDb();
  // Billed two months ahead of today, as the app does.
  const ahead = addMonthsToKey(currentMonthKey(), 2);
  partlyPaid = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: "2026-01-15", units: ["AC-T1-G01"] });
  unbilled = await l.createTenant({ name: "Bimal", rent: 4000, leaseStart: "2026-01-01", units: ["AC-T1-G02"] });
  government = await l.createTenant({
    name: "Block Office",
    rent: 20000,
    leaseStart: "2026-01-01",
    units: ["AC-T1-G03"],
    kind: "government",
  });
  governmentPaid = await l.createTenant({
    name: "Tehsil Office",
    rent: 15000,
    leaseStart: "2026-01-01",
    units: ["AC-T1-G04"],
    kind: "government",
  });
  await l.bill([partlyPaid, unbilled, government, governmentPaid], ahead);
  await l.pg.query(`delete from rent_periods where tenant_id = $1`, [unbilled]);

  // January paid in full, February partly.
  const [jan, feb] = await l.months(partlyPaid);
  await l.pay(partlyPaid, [
    { rent_period_id: jan.id, amount: 5000 },
    { rent_period_id: feb.id, amount: 2000 },
  ]);
  const [govJan] = await l.months(governmentPaid);
  await l.pay(governmentPaid, [{ rent_period_id: govJan.id, amount: 15000 }]);
});

afterAll(async () => {
  await l?.close();
});

const viaSql = async (scope: Scope, id: string) =>
  (await l.rows<{ v: TenantAccountSummaryDb }>(scope, sql`select tenant_account_summary(${id}::uuid) as v`))[0].v;
const viaDrizzle = (scope: Scope, id: string) => inScope(l.db, scope, (tx) => tenantAccountSummary(tx, id));

describe("tenantAccountSummary (replaces tenant_account_summary, 0022)", () => {
  const cases = () => [
    ["partly paid, billed ahead", partlyPaid],
    ["no months at all", unbilled],
    ["tracked government tenant, nothing recorded", government],
    ["government tenant with a payment", governmentPaid],
    ["unknown tenant", "00000000-0000-4000-8000-0000000000ff"],
  ] as const;

  it("matches the SQL function for the owner, case by case", async () => {
    for (const [label, id] of cases()) {
      expect({ label, value: await viaDrizzle(asOwner, id) }).toEqual({ label, value: await viaSql(asOwner, id) });
    }
  });

  it("matches the SQL function for another account: zeros and false (RLS)", async () => {
    for (const [label, id] of cases()) {
      const value = await viaDrizzle(asStranger, id);
      expect({ label, value }).toEqual({ label, value: await viaSql(asStranger, id) });
      expect(value).toEqual({
        total_outstanding: 0,
        overdue_months: 0,
        not_yet_due: 0,
        ended_months: 0,
        paid_ended_months: 0,
        can_stop_rent_tracking: false,
      });
    }
  });

  it("agrees with summarizeBalance and the stop-tracking rule", async () => {
    const months = await l.rows<{ id: string; period_month: string; amount_due: number; amount_allocated: number }>(
      asOwner,
      sql`select id, to_char(period_month, 'YYYY-MM-DD') as period_month, amount_due::float8 as amount_due,
            amount_allocated::float8 as amount_allocated from rent_periods where tenant_id = ${partlyPaid}::uuid`
    );
    const s = await viaDrizzle(asOwner, partlyPaid);
    expect({ totalOutstanding: s.total_outstanding, overdueMonths: s.overdue_months, notYetDue: s.not_yet_due }).toEqual(
      summarizeBalance(months, currentMonthKey())
    );
    expect(s.paid_ended_months).toBe(1);
    expect((await viaDrizzle(asOwner, government)).can_stop_rent_tracking).toBe(true);
    expect((await viaDrizzle(asOwner, governmentPaid)).can_stop_rent_tracking).toBe(false);
  });

  it("is what the owner repository returns for tenants.accountSummary", async () => {
    const repos = drizzleOwnerRepositories(l.db, { sub: OWNER });
    expect(await repos.tenants!.accountSummary!(partlyPaid)).toEqual(await viaSql(asOwner, partlyPaid));
  });

  it("returns plain numbers and a boolean, the shapes the service reads", async () => {
    const s = await viaDrizzle(asOwner, partlyPaid);
    for (const key of ["total_outstanding", "overdue_months", "not_yet_due", "ended_months", "paid_ended_months"] as const) {
      expect(typeof s[key]).toBe("number");
    }
    expect(typeof s.can_stop_rent_tracking).toBe("boolean");
  });
});
