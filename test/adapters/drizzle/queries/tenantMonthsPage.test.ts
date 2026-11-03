// Parity: the Drizzle tenantMonthsPage must answer exactly what
// tenant_months_page() (0019) answers - months, order, counts and page - for
// every "Show", sort, search and filter, as the owner and as anyone else.
// The data has paid, partly paid and unpaid ended months, and this month and
// the months ahead (not due yet, one of them paid in advance).
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonthsToKey, currentMonthKey } from "@/lib/dates";
import { TENANT_MONTH_SHOWS, billedThroughMonth } from "@/lib/domain/billing";
import { inScope, type Scope } from "@/server/adapters/drizzle/client";
import { tenantMonthsPage } from "@/server/adapters/drizzle/queries/tenantMonthsPage";
import type { TenantMonthsFilter } from "@/server/ports";
import { asOwner, asStranger, createLedgerDb, type LedgerDb } from "../fixtures";

const month = (offset: number) => addMonthsToKey(currentMonthKey(), offset);

let l: LedgerDb;
let asha: string;

beforeAll(async () => {
  l = await createLedgerDb({ oracles: true });
  asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: month(-4), units: ["AC-T1-G01"] });
  await l.bill([asha], billedThroughMonth());
  const m = await l.months(asha);
  // Paid, partly paid, unpaid, unpaid; this month partly; next month paid in advance.
  await l.pay(asha, [
    { rent_period_id: m[0].id, amount: 5000 },
    { rent_period_id: m[1].id, amount: 2500 },
    { rent_period_id: m[4].id, amount: 1000 },
    { rent_period_id: m[5].id, amount: 5000 },
  ]);
});

afterAll(async () => {
  await l?.close();
});

const base = (): TenantMonthsFilter => ({
  tenantId: asha,
  show: "all",
  filters: [],
  logic: "and",
  sort: "period_month",
  dir: "desc",
  page: 0,
  pageSize: 100,
});

const viaSql = async (scope: Scope, f: TenantMonthsFilter) =>
  (
    await l.rows<{ v: unknown }>(
      scope,
      sql`select tenant_months_page(${f.tenantId}::uuid, ${f.show}, ${f.search ?? null}, ${JSON.stringify(f.filters)}::jsonb,
            ${f.logic}, ${f.sort}, ${f.dir}, ${f.page}, ${f.pageSize}) as v`
    )
  )[0].v;
const viaDrizzle = (scope: Scope, f: TenantMonthsFilter) => inScope(l.db, scope, (tx) => tenantMonthsPage(tx, f));

async function same(f: Partial<TenantMonthsFilter>, scope: Scope = asOwner) {
  const filter = { ...base(), ...f };
  const drizzle = await viaDrizzle(scope, filter);
  expect(drizzle).toEqual(await viaSql(scope, filter));
  return drizzle;
}

describe("tenantMonthsPage on Drizzle matches tenant_months_page()", () => {
  it("every month, newest first, with the shown status", async () => {
    const page = await same({});
    expect(page.rows.map((r) => [r.period_month, r.display_status])).toEqual([
      [month(2), "not_due_yet"],
      [month(1), "paid"],
      [month(0), "not_due_yet"],
      [month(-1), "pending"],
      [month(-2), "pending"],
      [month(-3), "partially_paid"],
      [month(-4), "paid"],
    ]);
  });

  it("every Show, sort, search and filter", async () => {
    for (const show of TENANT_MONTH_SHOWS) await same({ show });
    for (const sort of ["period_month", "amount_due", "amount_allocated", "status"] as const) {
      for (const dir of ["asc", "desc"] as const) await same({ sort, dir, pageSize: 3 });
    }
    for (const search of ["not due", "partially", String(new Date().getFullYear()), "nobody"]) await same({ search });
    for (const operator of ["contains", "equals", "startsWith", "endsWith", "isEmpty", "isNotEmpty"] as const) {
      await same({ filters: [{ field: "status", operator, value: "Pending" }] });
      await same({ filters: [{ field: "month", operator, value: "20" }] });
    }
    await same({
      filters: [
        { field: "status", operator: "equals", value: "Paid" },
        { field: "status", operator: "equals", value: "Pending" },
      ],
      logic: "or",
    });
    expect((await same({ pageSize: 3, page: 9 })).page).toBe(2);
  });

  it("refuses what the table doesn't offer, and shows a stranger nothing", async () => {
    for (const f of [{ show: "owing" as TenantMonthsFilter["show"] }, { sort: "balance" as TenantMonthsFilter["sort"] }]) {
      await expect(viaDrizzle(asOwner, { ...base(), ...f })).rejects.toMatchObject({
        status: 400,
        message: "That table query isn't valid",
      });
      await expect(viaSql(asOwner, { ...base(), ...f })).rejects.toThrow();
    }
    expect(await same({}, asStranger)).toEqual({ rows: [], total: 0, all: 0, page: 0 });
  });
});
