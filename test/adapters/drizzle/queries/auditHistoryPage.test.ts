// Parity: the Drizzle auditHistoryPage must answer exactly what
// audit_history_page() (0018) answers - rows (the stored audit_log rows),
// order, counts and page - for the whole log (Activity) and one tenant
// (Change history), with actions, days, search, filters, sorts and pages,
// as the owner and as anyone else. The log is written by the real triggers
// from tenants, houses, rents and a payment, plus app events.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayKey, addDaysToKey } from "@/lib/dates";
import { inScope, type Scope } from "@/server/adapters/drizzle/client";
import { auditHistoryPage } from "@/server/adapters/drizzle/queries/auditHistoryPage";
import type { AuditHistoryFilter } from "@/server/ports";
import { asOwner, asStranger, createLedgerDb, type LedgerDb } from "../fixtures";

let l: LedgerDb;
let asha: string;
let chai: string;

beforeAll(async () => {
  l = await createLedgerDb();
  asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: "2026-01-01", units: ["AC-T1-G01"] });
  chai = await l.createTenant({ name: "Chai", rent: 3000, leaseStart: "2026-01-01", units: ["AC-T1-G02"] });
  await l.pg.query(`update tenants set business_name = 'Chai Point Pvt Ltd' where id = $1`, [chai]);
  await l.bill([asha, chai], "2026-03-01");
  const [jan] = await l.months(asha);
  await l.pay(asha, [{ rent_period_id: jan.id, amount: 5000 }]);
  await l.rows(asOwner, sql`select log_event('receipt.downloaded', ${asha}::uuid, 'payment', null, '{}'::jsonb)`);
  await l.rows(asOwner, sql`select log_event('auth.sign_in')`);
  // The sign-in at 19:00 UTC yesterday, which is already today in Kolkata. The log refuses
  // every change (D25), so the test sets it with triggers off for this one statement.
  await l.pg.exec(`set session_replication_role = replica`);
  await l.pg.query(`update audit_log set at = $1 where action = 'auth.sign_in'`, [`${addDaysToKey(todayKey(), -1)} 19:00:00+00`]);
  await l.pg.exec(`set session_replication_role = origin`);
});

afterAll(async () => {
  await l?.close();
});

const base = (): AuditHistoryFilter => ({ filters: [], logic: "and", sort: "at", dir: "desc", page: 0, pageSize: 100 });

const viaSql = async (scope: Scope, f: AuditHistoryFilter) =>
  (
    await l.rows<{ v: unknown }>(
      scope,
      sql`select audit_history_page(${f.tenantId ?? null}::uuid,
            ${f.actions ? sql`array(select jsonb_array_elements_text(${JSON.stringify(f.actions)}::jsonb))` : sql`null::text[]`},
            ${f.fromDate ?? null}::date, ${f.toDate ?? null}::date, ${f.search ?? null}, ${JSON.stringify(f.filters)}::jsonb,
            ${f.logic}, ${f.sort}, ${f.dir}, ${f.page}, ${f.pageSize}) as v`
    )
  )[0].v;
const viaDrizzle = (scope: Scope, f: AuditHistoryFilter) => inScope(l.db, scope, (tx) => auditHistoryPage(tx, f));

async function same(f: Partial<AuditHistoryFilter>, scope: Scope = asOwner) {
  const filter = { ...base(), ...f };
  const drizzle = await viaDrizzle(scope, filter);
  expect(drizzle).toEqual(await viaSql(scope, filter));
  return drizzle;
}

describe("auditHistoryPage on Drizzle matches audit_history_page()", () => {
  it("the whole log and one tenant's, newest first, as stored", async () => {
    const all = await same({});
    expect(all.all).toBeGreaterThan(5);
    expect(all.rows.map((r) => r.id)).toEqual([...all.rows.map((r) => r.id)].sort((a, b) => b - a));
    expect(all.rows[0]).toMatchObject({ action: expect.any(String), title: expect.any(String), details: expect.any(String) });
    const ashas = await same({ tenantId: asha });
    expect(ashas.rows.every((r) => r.tenant_id === asha)).toBe(true);
    await same({ tenantId: chai });
  });

  it("actions, including none at all", async () => {
    await same({ actions: ["payment.recorded", "receipt.downloaded"] });
    await same({ actions: ["tenant.created"], tenantId: chai });
    expect((await same({ actions: [] })).total).toBe(0);
  });

  it("Kolkata days", async () => {
    const yesterday = addDaysToKey(todayKey(), -1);
    // 19:00 UTC yesterday is already today in Kolkata.
    expect((await same({ fromDate: todayKey(), actions: ["auth.sign_in"] })).total).toBe(1);
    expect((await same({ toDate: yesterday, actions: ["auth.sign_in"] })).total).toBe(0);
    await same({ fromDate: yesterday, toDate: todayKey() });
  });

  it("every sort both ways, search, every filter, and pages", async () => {
    for (const sort of ["at", "actor_name", "title", "tenant_name", "unit_code"] as const) {
      for (const dir of ["asc", "desc"] as const) await same({ sort, dir, pageSize: 4 });
    }
    for (const search of ["asha", "chai point", "AC-T1-G01", "5,000", "nobody"]) await same({ search });
    for (const operator of ["contains", "equals", "startsWith", "endsWith", "isEmpty", "isNotEmpty"] as const) {
      for (const [field, value] of [
        ["actor_name", "a"],
        ["title", "Payment"],
        ["tenant_name", "Chai Point Pvt Ltd"],
        ["unit_code", "AC-T1-G02"],
        ["details", "5"],
      ] as const) {
        await same({ filters: [{ field, operator, value }] });
      }
    }
    await same({
      filters: [
        { field: "tenant_name", operator: "equals", value: "Asha" },
        { field: "unit_code", operator: "equals", value: "AC-T1-G02" },
      ],
      logic: "or",
    });
    expect((await same({ pageSize: 3, page: 99 })).page).toBe(Math.ceil((await same({})).total / 3) - 1);
  });

  it("refuses what it doesn't offer, in the history's words", async () => {
    // Drizzle wraps the SQL function's error; Postgres' own message is its cause.
    const sqlMessage = (f: AuditHistoryFilter) =>
      viaSql(asOwner, f).then(
        () => "no error",
        (e: { cause?: { message?: string } }) => e.cause?.message
      );
    for (const f of [{ sort: "details" as AuditHistoryFilter["sort"] }, { pageSize: 0 }]) {
      await expect(viaDrizzle(asOwner, { ...base(), ...f })).rejects.toMatchObject({
        status: 400,
        message: "That history query isn't valid",
      });
      expect(await sqlMessage({ ...base(), ...f })).toBe("That history query isn't valid");
    }
    const badFilter = { ...base(), filters: [{ field: "at" as "title", operator: "contains" as const, value: "x" }] };
    await expect(viaDrizzle(asOwner, badFilter)).rejects.toMatchObject({ message: "That history filter isn't valid" });
    expect(await sqlMessage(badFilter)).toBe("That history filter isn't valid");
  });

  it("shows another signed-in account nothing", async () => {
    expect(await same({}, asStranger)).toEqual({ rows: [], total: 0, all: 0, page: 0 });
  });
});
