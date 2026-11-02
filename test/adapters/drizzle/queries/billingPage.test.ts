// Parity: the Drizzle billingPage / billingTotals must answer exactly what
// billing_page() and billing_totals() (0021) answer - rows (with their
// payments), order, counts and page, and the stat cards - for a matrix of
// ranges, "Show" choices, searches, filters, sorts and pages, as the owner
// and as anyone else. The data spans ended months, this month and the months
// billed ahead, so "not due yet" and the paid-direct horizon are exercised.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonthsToKey, currentMonthKey } from "@/lib/dates";
import { BILLING_SHOWS, billedThroughMonth } from "@/lib/domain/billing";
import { inScope, type Scope } from "@/server/adapters/drizzle/client";
import { billingPage, billingTotals } from "@/server/adapters/drizzle/queries/billingPage";
import type { BillingFilter } from "@/server/ports";
import { asOwner, asStranger, createLedgerDb, type LedgerDb } from "../fixtures";

const month = (offset: number) => addMonthsToKey(currentMonthKey(), offset);

let l: LedgerDb;
const ids: Record<string, string> = {};

beforeAll(async () => {
  l = await createLedgerDb();
  await l.pg.exec(`
    insert into properties (property_code, location_code, name) values ('AC-T2', 'AC', 'Tower 2');
    insert into units (unit_code, property_code, floor, unit_type) values
      ('AC-T2-101', 'AC-T2', '1', 'residential'), ('AC-T2-102', 'AC-T2', '1', 'commercial'),
      ('AC-T2-103', 'AC-T2', '1', 'commercial');
  `);
  const lease = `${month(-4)}`;
  ids.asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: lease, units: ["AC-T1-G01"] });
  ids.bimal = await l.createTenant({ name: "Bimal", rent: 8000, leaseStart: lease, units: ["AC-T1-G02", "AC-T2-101"] });
  ids.chai = await l.createTenant({ name: "Chai", rent: 3000, leaseStart: lease, units: ["AC-T1-G03"] });
  await l.pg.query(`update tenants set business_name = 'Chai Point Pvt Ltd' where id = $1`, [ids.chai]);
  // Government, rent paid to the owner's bank directly: computed months, never stored.
  ids.govt = await l.createTenant({
    name: "Block Office",
    rent: 20000,
    leaseStart: month(-6),
    units: ["AC-T1-G04"],
    kind: "government",
    rentTracked: false,
  });
  ids.dev = await l.createTenant({ name: "Dev", rent: 4000, leaseStart: lease, units: ["AC-T1-G05"] });
  // Government paid direct, moved out last month, with its first rate a month after the lease:
  // the move-out cap and the first-rate fallback.
  ids.tehsil = await l.createTenant({
    name: "Tehsil Office",
    rent: 15000,
    leaseStart: month(-6),
    units: ["AC-T1-G06"],
    kind: "government",
    rentTracked: false,
  });
  await l.pg.query(`update tenant_rent_rates set effective_month = $2 where tenant_id = $1`, [ids.tehsil, month(-5)]);
  await l.rows(asOwner, sql`select move_out_tenant(${ids.tehsil}::uuid, (${month(0)}::date - 1))`);
  // Never paid direct: a draft, and a government tenant whose rent is tracked (stored months instead).
  ids.draftGovt = await l.createTenant({
    name: "Draft Office",
    rent: 9000,
    leaseStart: month(-6),
    units: ["AC-T2-103"],
    kind: "government",
    rentTracked: false,
  });
  await l.pg.query(`update tenants set status = 'draft' where id = $1`, [ids.draftGovt]);
  ids.trackedGovt = await l.createTenant({
    name: "Post Office",
    rent: 7000,
    leaseStart: lease,
    units: ["AC-T2-102"],
    kind: "government",
  });
  await l.bill([ids.asha, ids.bimal, ids.chai, ids.dev, ids.trackedGovt], billedThroughMonth());

  const pay = async (tenant: string, allocations: [number, number][], date: string, mode = "cash") => {
    const months = await l.months(tenant);
    const list = allocations.map(([i, amount]) => ({ rent_period_id: months[i].id, amount }));
    const amount = list.reduce((s, a) => s + a.amount, 0);
    await l.rows(
      asOwner,
      sql`select create_payment(gen_random_uuid(), ${tenant}::uuid, ${amount}, ${date}::date, ${mode}, null,
            'sig.png', md5(random()::text), now() + interval '14 days', ${JSON.stringify(list)}::jsonb)`
    );
  };
  // Asha: the first two months in full (two payments on the second), the third partly.
  await pay(ids.asha, [[0, 5000], [1, 2000]], `${month(-3)}`.replace(/01$/, "05"));
  await pay(ids.asha, [[1, 3000], [2, 1000]], `${month(-2)}`.replace(/01$/, "10"), "upi");
  // Bimal: paid this month and next in advance.
  await pay(ids.bimal, [[4, 8000], [5, 8000]], `${month(0)}`.replace(/01$/, "01"), "bank_transfer");
  // Chai: half of the first month.
  await pay(ids.chai, [[0, 1500]], `${month(-3)}`.replace(/01$/, "20"));
  // 500 of Asha's second month taken back: counts in collected, never under "Paid by".
  const [, ashaSecond] = await l.months(ids.asha);
  const [ashaPayment] = await l.rows<{ id: string }>(
    asOwner,
    sql`select payment_id as id from payment_allocations where rent_period_id = ${ashaSecond.id}::uuid
        order by created_at limit 1`
  );
  await l.rows(
    asOwner,
    sql`select create_adjustment(gen_random_uuid(), ${ashaPayment.id}::uuid, -500, 'Counted twice', 'sig.png',
          md5(random()::text), now() + interval '14 days', ${JSON.stringify([{ rent_period_id: ashaSecond.id, amount: -500 }])}::jsonb)`
  );
  // A payment that isn't confirmed (an old row from before 0010): never under "Paid by".
  const chaiMonths = await l.months(ids.chai);
  await l.pg.query(
    `with p as (
       insert into payments (tenant_id, amount, payment_date, mode, status, token_hash, token_expires_at, receipt_no)
       values ($1, 700, $2, 'cash', 'pending', md5(random()::text), now(), 'OLD/001') returning id
     )
     insert into payment_allocations (payment_id, rent_period_id, amount_allocated) select p.id, $3, 700 from p`,
    [ids.chai, chaiMonths[1].period_month, chaiMonths[1].id]
  );
  // Dev moved out at the end of last month: his last tower stays shown.
  await l.rows(asOwner, sql`select move_out_tenant(${ids.dev}::uuid, (${month(0)}::date - 1))`);
});

afterAll(async () => {
  await l?.close();
});

const BASE: BillingFilter = {
  from: month(-4),
  to: month(2),
  paidDirect: true,
  show: "all",
  filters: [],
  logic: "and",
  sort: "amount_allocated",
  dir: "desc",
  page: 0,
  pageSize: 100,
};

const viaSql = async (scope: Scope, f: BillingFilter) =>
  (
    await l.rows<{ v: unknown }>(
      scope,
      sql`select billing_page(${f.from}::date, ${f.to}::date, ${f.paidDirect}, ${f.show}, ${f.search ?? null},
            ${JSON.stringify(f.filters)}::jsonb, ${f.logic}, ${f.sort}, ${f.dir}, ${f.page}, ${f.pageSize}) as v`
    )
  )[0].v;
const viaDrizzle = (scope: Scope, f: BillingFilter) => inScope(l.db, scope, (tx) => billingPage(tx, f));

async function same(f: Partial<BillingFilter>, scope: Scope = asOwner) {
  const filter = { ...BASE, ...f };
  const drizzle = await viaDrizzle(scope, filter);
  expect(drizzle).toEqual(await viaSql(scope, filter));
  return drizzle;
}

const totalsViaSql = async (scope: Scope, r: { from: string; to: string; paidDirect: boolean }) =>
  (await l.rows<{ v: unknown }>(scope, sql`select billing_totals(${r.from}::date, ${r.to}::date, ${r.paidDirect}) as v`))[0].v;

describe("billingPage on Drizzle matches billing_page()", () => {
  it("the whole range: stored months, paid-direct months to the horizon, payments and houses", async () => {
    const page = await same({});
    expect(page.all).toBe(page.total);
    const govt = page.rows.filter((r) => r.tenant_id === ids.govt);
    // From the range's start to two months ahead, never stored.
    expect(govt.map((r) => r.period_month).sort()).toEqual([-4, -3, -2, -1, 0, 1, 2].map(month));
    expect(govt.every((r) => r.paid_direct && r.id.startsWith("paid-direct:") && r.payments.length === 0)).toBe(true);
    const ashaSecond = page.rows.find((r) => r.tenant_id === ids.asha && r.period_month === month(-3));
    expect(ashaSecond?.payments.map((p) => p.amount)).toEqual([2000, 3000]);
    expect(page.rows.find((r) => r.tenant_id === ids.bimal)).toMatchObject({
      property_name: "Tower 1, Tower 2",
      unit_codes: ["AC-T1-G02", "AC-T2-101"],
    });
    expect(page.rows.find((r) => r.tenant_id === ids.chai)?.tenant_name).toBe("Chai Point Pvt Ltd");
    // Moved out last month: paid direct up to that month only, at the first rate before it began.
    const tehsil = page.rows.filter((r) => r.tenant_id === ids.tehsil);
    expect(tehsil.map((r) => r.period_month).sort()).toEqual([-4, -3, -2, -1].map(month));
    // A draft and a tracked government tenant are never paid direct.
    expect(page.rows.some((r) => r.tenant_id === ids.draftGovt)).toBe(false);
    expect(page.rows.filter((r) => r.tenant_id === ids.trackedGovt).every((r) => !r.paid_direct)).toBe(true);
    // The adjustment lowers what is counted but adds no "Paid by" line; the unconfirmed payment shows nowhere.
    expect(ashaSecond?.amount_allocated).toBe(4500);
    const chaiSecond = page.rows.find((r) => r.tenant_id === ids.chai && r.period_month === month(-3));
    expect(chaiSecond?.payments).toEqual([]);
  });

  it("the first-rate fallback, from before the first rate", async () => {
    const early = await same({ from: month(-6), to: month(-5) });
    expect(early.rows.filter((r) => r.tenant_id === ids.tehsil).map((r) => [r.period_month, r.amount_due])).toEqual([
      [month(-5), 15000],
      [month(-6), 15000],
    ]);
  });

  it("every Show, without paid-direct months too", async () => {
    for (const show of BILLING_SHOWS) {
      await same({ show });
      await same({ show, paidDirect: false });
    }
  });

  it("every sort, both ways, including status by need then balance", async () => {
    for (const sort of ["period_month", "tenant_name", "amount_due", "amount_allocated", "balance", "status"] as const) {
      for (const dir of ["asc", "desc"] as const) await same({ sort, dir, pageSize: 10 });
    }
  });

  it("search and every filter on every column", async () => {
    for (const search of ["asha", "tower 2", "paid to your bank", "partially paid", "not due", "/", "nobody"]) await same({ search });
    for (const operator of ["contains", "equals", "startsWith", "endsWith", "isEmpty", "isNotEmpty"] as const) {
      for (const [field, value] of [
        ["month", "2026"],
        ["tenant", "Chai Point Pvt Ltd"],
        ["status", "Paid"],
        ["payments", ")"],
      ] as const) {
        await same({ filters: [{ field, operator, value }] });
      }
    }
    await same({
      filters: [
        { field: "status", operator: "equals", value: "Pending" },
        { field: "status", operator: "equals", value: "Paid direct" },
      ],
      logic: "or",
    });
  });

  it("pages, and a page past the end is the last one", async () => {
    await same({ pageSize: 10, page: 1 });
    const past = await same({ pageSize: 10, page: 50 });
    expect(past.page).toBe(Math.max(0, Math.ceil(past.total / 10) - 1));
  });

  it("refuses what the table doesn't offer", async () => {
    for (const f of [
      { show: "owing" as BillingFilter["show"] },
      { from: month(1), to: month(0) },
      { sort: "note" as BillingFilter["sort"] },
      { pageSize: 500 },
    ]) {
      await expect(viaDrizzle(asOwner, { ...BASE, ...f })).rejects.toMatchObject({ status: 400 });
      await expect(viaSql(asOwner, { ...BASE, ...f })).rejects.toThrow();
    }
  });

  it("shows another signed-in account nothing", async () => {
    expect(await same({}, asStranger)).toEqual({ rows: [], total: 0, all: 0, page: 0 });
  });
});

describe("billingTotals on Drizzle matches billing_totals()", () => {
  it("for several ranges, with and without paid-direct months, and for a stranger", async () => {
    for (const [from, to] of [
      [month(-4), month(2)],
      [month(-3), month(-3)],
      [month(0), month(2)],
      [month(-12), month(-8)],
    ]) {
      for (const paidDirect of [true, false]) {
        const range = { from, to, paidDirect };
        expect(await inScope(l.db, asOwner, (tx) => billingTotals(tx, range))).toEqual(await totalsViaSql(asOwner, range));
      }
    }
    const all = { from: month(-4), to: month(2), paidDirect: true };
    expect(await inScope(l.db, asOwner, (tx) => billingTotals(tx, all))).toMatchObject({ tenants: 7 });
    for (const [from, to] of [
      [month(-6), month(-5)],
      [month(-1), month(-1)],
    ]) {
      const range = { from, to, paidDirect: true };
      expect(await inScope(l.db, asOwner, (tx) => billingTotals(tx, range))).toEqual(await totalsViaSql(asOwner, range));
    }
    expect(await inScope(l.db, asStranger, (tx) => billingTotals(tx, all))).toEqual(await totalsViaSql(asStranger, all));
  });
});
