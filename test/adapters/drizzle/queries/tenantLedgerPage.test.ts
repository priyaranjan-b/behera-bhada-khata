// Parity: the Drizzle tenantLedgerPage must answer exactly what
// tenant_ledger_page() (0020) answers - the journal, its running balance,
// order, counts and page - for a matrix of date ranges, searches, filters,
// sorts and pages, as the owner and as anyone else. The data has billed and
// upcoming charges, payments with and without notes, an unconfirmed
// payment, both kinds of adjustment and an acknowledged receipt.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonthsToKey, currentMonthKey } from "@/lib/dates";
import { billedThroughMonth } from "@/lib/domain/billing";
import { inScope, type Scope } from "@/server/adapters/drizzle/client";
import { tenantLedgerPage } from "@/server/adapters/drizzle/queries/tenantLedgerPage";
import type { TenantLedgerFilter } from "@/server/ports";
import { asOwner, asStranger, createLedgerDb, type LedgerDb } from "../fixtures";

const month = (offset: number) => addMonthsToKey(currentMonthKey(), offset);
const day = (offset: number, d: number) => `${month(offset).slice(0, 8)}${String(d).padStart(2, "0")}`;

let l: LedgerDb;
let asha: string;
let bimal: string;

beforeAll(async () => {
  l = await createLedgerDb();
  asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: month(-3), units: ["AC-T1-G01"] });
  bimal = await l.createTenant({ name: "Bimal", rent: 4000, leaseStart: month(-1), units: ["AC-T1-G02"] });
  await l.bill([asha, bimal], billedThroughMonth());
  const months = await l.months(asha);

  const pay = async (id: string, allocations: [number, number][], date: string, mode: string, note: string | null) => {
    const list = allocations.map(([i, amount]) => ({ rent_period_id: months[i].id, amount }));
    const amount = list.reduce((s, a) => s + a.amount, 0);
    await l.rows(
      asOwner,
      sql`select create_payment(${id}::uuid, ${asha}::uuid, ${amount}, ${date}::date, ${mode}, ${note},
            'sig.png', md5(random()::text), now() + interval '14 days', ${JSON.stringify(list)}::jsonb)`
    );
  };
  const P1 = "00000000-0000-4000-8000-0000000000e1";
  const P2 = "00000000-0000-4000-8000-0000000000e2";
  // Same day as the month's charge, so the journal's type order decides.
  await pay(P1, [[0, 5000], [1, 2000]], month(-3), "bank_transfer", "50% now_later");
  await pay(P2, [[1, 3000]], day(-2, 15), "upi", null);
  // The tenant signed P2.
  await l.pg.query(`update payments set acknowledged_at = now() where id = $1`, [P2]);
  // Both kinds of adjustment against P1: -500 (a debit) and +200 (a credit).
  for (const [delta, period] of [
    [-500, 1],
    [200, 1],
  ] as const) {
    await l.rows(
      asOwner,
      sql`select create_adjustment(gen_random_uuid(), ${P1}::uuid, ${delta}, ${delta < 0 ? "Counted twice" : "Short by 200"},
            'sig.png', md5(random()::text), now() + interval '14 days',
            ${JSON.stringify([{ rent_period_id: months[period].id, amount: delta }])}::jsonb)`
    );
  }
  // Dated by the Kolkata day: 20:00 UTC on the 10th is already the 11th there.
  await l.pg.query(`update adjustments set confirmed_at = $2 where tenant_id = $1 and delta_amount < 0`, [
    asha,
    `${day(-2, 10)} 20:00:00+00`,
  ]);
  // An old unconfirmed adjustment: dated by when it was created, shown, not counted in the balance.
  await l.pg.query(
    `insert into adjustments (tenant_id, original_payment_id, delta_amount, reason, status, token_hash, token_expires_at,
       receipt_no, created_at, confirmed_at)
     values ($1, $2, -300, 'Old correction', 'pending', md5(random()::text), now(), 'ADJ/OLD/001', $3, null)`,
    [asha, P1, `${day(-1, 4)} 19:30:00+00`]
  );
  // An old unconfirmed payment: shown, not counted in the balance.
  await l.pg.query(
    `insert into payments (tenant_id, amount, payment_date, mode, status, token_hash, token_expires_at, receipt_no)
     values ($1, 700, $2, 'cash', 'pending', md5(random()::text), now(), 'OLD/001')`,
    [asha, day(-1, 3)]
  );
  // Bimal pays too: never in Asha's ledger.
  const [bm] = await l.months(bimal);
  await l.pay(bimal, [{ rent_period_id: bm.id, amount: 4000 }], day(-1, 2));
});

afterAll(async () => {
  await l?.close();
});

const base = (): TenantLedgerFilter => ({
  tenantId: asha,
  filters: [],
  logic: "and",
  sort: "date",
  dir: "desc",
  page: 0,
  pageSize: 100,
});

const viaSql = async (scope: Scope, f: TenantLedgerFilter) =>
  (
    await l.rows<{ v: unknown }>(
      scope,
      sql`select tenant_ledger_page(${f.tenantId}::uuid, ${f.fromDate ?? null}::date, ${f.toDate ?? null}::date,
            ${f.search ?? null}, ${JSON.stringify(f.filters)}::jsonb, ${f.logic}, ${f.sort}, ${f.dir}, ${f.page}, ${f.pageSize}) as v`
    )
  )[0].v;
const viaDrizzle = (scope: Scope, f: TenantLedgerFilter) => inScope(l.db, scope, (tx) => tenantLedgerPage(tx, f));

async function same(f: Partial<TenantLedgerFilter>, scope: Scope = asOwner) {
  const filter = { ...base(), ...f };
  const drizzle = await viaDrizzle(scope, filter);
  expect(drizzle).toEqual(await viaSql(scope, filter));
  return drizzle;
}

describe("tenantLedgerPage on Drizzle matches tenant_ledger_page()", () => {
  it("the whole journal, with the all-time running balance", async () => {
    const page = await same({});
    // 6 charges (3 ended, this month, 2 ahead), 3 payments, 3 adjustments.
    expect(page.all).toBe(12);
    expect(page.rows.filter((r) => r.type === "charge").map((r) => r.status)).toEqual([
      "upcoming",
      "upcoming",
      "upcoming",
      "billed",
      "billed",
      "billed",
    ]);
    expect(page.rows.find((r) => r.status === "pending" && r.type === "payment")).toMatchObject({ credit: 700 });
    const adjustments = page.rows.filter((r) => r.type === "adjustment" && r.status === "confirmed");
    expect(adjustments.map((r) => [r.debit, r.credit]).sort()).toEqual([
      [0, 200],
      [500, 0],
    ]);
    expect(page.rows.find((r) => r.receipt_no?.startsWith("ADJ/") && r.debit === 500)?.date).toBe(day(-2, 11));
    const old = page.rows.find((r) => r.receipt_no === "ADJ/OLD/001");
    expect(old).toMatchObject({ status: "pending", date: day(-1, 5), debit: 300 });
    // Pending rows add nothing: the balance before and after the old adjustment is the same.
    const n = page.rows.indexOf(old!);
    expect(old!.balance).toBe(page.rows[n + 1].balance);
    expect(page.rows.find((r) => r.ref_id === "00000000-0000-4000-8000-0000000000e2")).toMatchObject({
      acknowledged: true,
      description: "Payment received (upi)",
    });
    expect(page.rows.some((r) => r.description.includes("(bank transfer) — 50% now_later"))).toBe(true);
  });

  it("every sort, both ways, and pages", async () => {
    for (const sort of ["date", "description", "status", "debit", "credit", "balance"] as const) {
      for (const dir of ["asc", "desc"] as const) await same({ sort, dir, pageSize: 4 });
    }
    await same({ pageSize: 4, page: 2 });
    expect((await same({ pageSize: 4, page: 9 })).page).toBe(2);
  });

  it("date ranges: the balance stays all-time", async () => {
    await same({ fromDate: month(-2) });
    await same({ toDate: day(-2, 20) });
    const lastMonth = await same({ fromDate: month(-1), toDate: day(-1, 28) });
    expect(lastMonth.all).toBe(12);
    // The Kolkata day decides which day an adjustment is on.
    expect((await same({ fromDate: day(-2, 11), toDate: day(-2, 11) })).total).toBe(1);
    expect((await same({ fromDate: day(-2, 10), toDate: day(-2, 10) })).total).toBe(0);
  });

  it("search and every filter on every column", async () => {
    for (const search of ["rent due", "signed by tenant", "not signed", "#", "50%", "now_later", "not due", "pending", "nobody"]) {
      await same({ search });
    }
    for (const operator of ["contains", "equals", "startsWith", "endsWith", "isEmpty", "isNotEmpty"] as const) {
      for (const [field, value] of [
        ["date", "/"],
        ["description", "Adjustment"],
        ["status", "Confirmed"],
      ] as const) {
        await same({ filters: [{ field, operator, value }] });
      }
    }
    await same({
      filters: [
        { field: "status", operator: "equals", value: "Pending" },
        { field: "status", operator: "equals", value: "Not due yet" },
      ],
      logic: "or",
    });
  });

  it("refuses what the table doesn't offer", async () => {
    for (const f of [{ sort: "amount" as TenantLedgerFilter["sort"] }, { pageSize: 0 }, { fromDate: "2026-13-01" }]) {
      await expect(viaDrizzle(asOwner, { ...base(), ...f })).rejects.toMatchObject({ status: 400 });
      await expect(viaSql(asOwner, { ...base(), ...f })).rejects.toThrow();
    }
  });

  it("another tenant's journal, and nothing for another signed-in account", async () => {
    expect((await same({ tenantId: bimal })).all).toBe(5);
    expect(await same({}, asStranger)).toEqual({ rows: [], total: 0, all: 0, page: 0 });
  });
});
