// Parity: the Drizzle paymentsPage must answer exactly what payments_page()
// (0026) answers - rows, order, counts, page and the totals per mode - for a
// matrix of searches, filters, sorts and pages, as the owner and as anyone
// else. Also pins the text it searches (dates, months, modes, towers) to the
// TS functions the UI uses. The frozen function predates tags (0030), so
// the comparison leaves each row's `tags` out (none are set while it runs);
// the tags' own tests come last.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDateKey, formatMonth, todayKey } from "@/lib/dates";
import { PAYMENT_MODE_LABELS, paymentModeLabel } from "@/lib/domain/payments";
import { PAYMENT_MODES, type PaymentMode } from "@/lib/types";
import { inScope, type Scope } from "@/server/adapters/drizzle/client";
import { paymentsPage } from "@/server/adapters/drizzle/queries/paymentsPage";
import { dateLabel, labelOf, monthLabel, towersNow } from "@/server/adapters/drizzle/queries/text";
import type { PaymentsFilter } from "@/server/ports";
import { asOwner, asStranger, createLedgerDb, type LedgerDb } from "../fixtures";

let l: LedgerDb;
const tenants: Record<string, string> = {};

beforeAll(async () => {
  l = await createLedgerDb({ oracles: true });
  await l.pg.exec(`
    insert into properties (property_code, location_code, name) values ('AC-T2', 'AC', 'Tower 2');
    insert into units (unit_code, property_code, floor, unit_type) values ('AC-T2-101', 'AC-T2', '1', 'residential');
  `);
  tenants.asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: "2026-01-01", units: ["AC-T1-G01"] });
  // Two towers: "Tower 1, Tower 2".
  tenants.bimal = await l.createTenant({ name: "Bimal", rent: 8000, leaseStart: "2026-01-01", units: ["AC-T1-G02", "AC-T2-101"] });
  tenants.chai = await l.createTenant({ name: "Chai Point", rent: 3000, leaseStart: "2026-01-01", units: ["AC-T1-G03"] });
  // A business name wins over the person's name.
  await l.pg.query(`update tenants set business_name = 'Chai Point Pvt Ltd' where id = $1`, [tenants.chai]);
  tenants.dev = await l.createTenant({ name: "Dev", rent: 4000, leaseStart: "2026-01-01", units: ["AC-T1-G04"] });
  await l.bill(Object.values(tenants), "2026-04-01");

  const pay = async (tenant: string, monthIndexes: number[], amounts: number[], date: string, mode: PaymentMode, note: string | null) => {
    const months = await l.months(tenant);
    const allocations = monthIndexes.map((i, k) => ({ rent_period_id: months[i].id, amount: amounts[k] }));
    const amount = amounts.reduce((a, b) => a + b, 0);
    await l.rows(
      asOwner,
      sql`select create_payment(gen_random_uuid(), ${tenant}::uuid, ${amount}, ${date}::date, ${mode}, ${note},
            'sig.png', md5(random()::text), now() + interval '14 days', ${JSON.stringify(allocations)}::jsonb)`
    );
  };
  await pay(tenants.asha, [0, 1], [5000, 5000], "2026-02-03", "upi", "Paid via UPI");
  await pay(tenants.asha, [2], [2500], "2026-03-15", "cash", "50% now, rest_later \\ ok");
  await pay(tenants.bimal, [0], [8000], "2026-01-31", "bank_transfer", null);
  await pay(tenants.bimal, [1], [4000], "2026-03-15", "cheque", "Cheque no. 1234");
  await pay(tenants.chai, [0, 1, 2], [3000, 3000, 3000], "2026-03-01", "other", "Includes previous dues");
  await pay(tenants.dev, [0], [1000], "2026-02-20", "cash", "");
  // Dev moved out in February: his tower is the one he held last.
  await l.rows(asOwner, sql`select move_out_tenant(${tenants.dev}::uuid, '2026-02-28'::date)`);
});

afterAll(async () => {
  await l?.close();
});

const BASE: PaymentsFilter = {
  from: "2026-01-01",
  to: "2026-03-31",
  filters: [],
  logic: "and",
  sort: "payment_date",
  dir: "desc",
  page: 0,
  pageSize: 10,
};

const viaSql = async (scope: Scope, f: PaymentsFilter) =>
  (
    await l.rows<{ v: unknown }>(
      scope,
      sql`select payments_page(${f.from}::date, ${f.to}::date, ${f.search ?? null}, ${JSON.stringify(f.filters)}::jsonb,
            ${f.logic}, ${f.sort}, ${f.dir}, ${f.page}, ${f.pageSize}) as v`
    )
  )[0].v;
const viaDrizzle = (scope: Scope, f: PaymentsFilter) => inScope(l.db, scope, (tx) => paymentsPage(tx, f));

/** Same answer both ways (bar the rows' tags, which payments_page() never had), and the Drizzle one returned. */
async function same(f: Partial<PaymentsFilter>, scope: Scope = asOwner) {
  const filter = { ...BASE, ...f };
  const drizzle = await viaDrizzle(scope, filter);
  expect(drizzle.rows.every((r) => Array.isArray(r.tags))).toBe(true);
  expect({ ...drizzle, rows: drizzle.rows.map(({ tags: _tags, ...r }) => r) }).toEqual(await viaSql(scope, filter));
  return drizzle;
}

describe("paymentsPage on Drizzle matches payments_page()", () => {
  it("the whole range, newest first, with the totals per mode", async () => {
    const page = await same({});
    expect(page.all).toBe(6);
    expect(page.total).toBe(6);
    expect(page.totals).toEqual({
      amount: 34500,
      count: 6,
      by_mode: { cash: 3500, bank_transfer: 8000, upi: 10000, cheque: 4000, other: 9000 },
    });
    const bimal = page.rows.find((r) => r.tenant_id === tenants.bimal && r.mode === "cheque");
    expect(bimal).toMatchObject({ property_name: "Tower 1, Tower 2", months_text: "February 2026", amount: 4000 });
    expect(page.rows.find((r) => r.tenant_id === tenants.chai)?.tenant_name).toBe("Chai Point Pvt Ltd");
    expect(page.rows.find((r) => r.tenant_id === tenants.dev)?.property_name).toBe("Tower 1");
  });

  it("every sort, both ways", async () => {
    for (const sort of ["payment_date", "receipt_no", "tenant_name", "mode", "amount"] as const) {
      for (const dir of ["asc", "desc"] as const) await same({ sort, dir });
    }
  });

  it("search: every word somewhere in the row, case-insensitive; % and _ match themselves", async () => {
    // Each word on its own: "tower" and "2" are in every row (Tower 1, 2026).
    expect((await same({ search: "tower 2" })).total).toBe(6);
    expect((await same({ search: "bimal" })).total).toBe(2);
    expect((await same({ search: "  asha   upi " })).total).toBe(1);
    expect((await same({ search: "15/03/2026" })).total).toBe(2);
    expect((await same({ search: "march 2026" })).total).toBe(2);
    expect((await same({ search: "50%" })).total).toBe(1);
    expect((await same({ search: "rest_later" })).total).toBe(1);
    expect((await same({ search: "\\" })).total).toBe(1);
    expect((await same({ search: "%" })).total).toBe(1);
    expect((await same({ search: "nobody" })).total).toBe(0);
    // A no-break space joins two words, in Postgres' \s and so here.
    expect((await same({ search: "Paid\u00a0via" })).total).toBe(0);
    expect((await same({ search: "paid\tvia\nupi" })).total).toBe(1);
  });

  it("every filter operator, with and / or, and filters without a value ignored", async () => {
    for (const operator of ["contains", "equals", "startsWith", "endsWith"] as const) {
      for (const [field, value] of [
        ["date", "15/03/2026"],
        ["receipt", "/0"],
        ["tenant", "Asha"],
        ["mode", "Cash"],
        ["months", "February 2026"],
        ["note", "paid"],
      ] as const) {
        await same({ filters: [{ field, operator, value }] });
        await same({ filters: [{ field, operator, value: `  ${value.toUpperCase()}  ` }] });
      }
    }
    expect((await same({ filters: [{ field: "note", operator: "isEmpty" }] })).total).toBe(2);
    expect((await same({ filters: [{ field: "note", operator: "isNotEmpty" }] })).total).toBe(4);
    const either = [
      { field: "mode", operator: "equals", value: "UPI" },
      { field: "mode", operator: "equals", value: "Cheque" },
    ] as PaymentsFilter["filters"];
    expect((await same({ filters: either, logic: "or" })).total).toBe(2);
    expect((await same({ filters: either, logic: "and" })).total).toBe(0);
    expect((await same({ filters: [{ field: "note", operator: "contains", value: "   " }] })).total).toBe(6);
    expect((await same({ filters: either, logic: "or", search: "asha" })).total).toBe(1);
  });

  it("pages, and a page past the end is the last one", async () => {
    await same({ pageSize: 4, page: 0 });
    await same({ pageSize: 4, page: 1 });
    expect((await same({ pageSize: 4, page: 9 })).page).toBe(1);
    expect((await same({ pageSize: 4, page: 3, search: "nobody" })).page).toBe(0);
    expect((await same({ pageSize: 3, page: 1 })).page).toBe(1);
    expect((await same({ pageSize: 3, page: 2 })).page).toBe(1);
  });

  it("a shorter range, and the cards follow the search", async () => {
    const march = await same({ from: "2026-03-01", to: "2026-03-31" });
    expect(march.all).toBe(3);
    const cash = await same({ search: "cash" });
    expect(cash.totals.by_mode).toMatchObject({ cash: 3500, upi: 0 });
  });

  it("refuses what the table doesn't offer, as the SQL did", async () => {
    const bad: Partial<PaymentsFilter>[] = [
      { from: "2026-03-01", to: "2026-02-01" },
      { from: "2024-01-01", to: "2026-03-31" },
      { from: "2026-02-30" },
      { sort: "note" as PaymentsFilter["sort"] },
      { dir: "up" as PaymentsFilter["dir"] },
      { logic: "xor" as PaymentsFilter["logic"] },
      { page: -1 },
      { pageSize: 0 },
      { pageSize: 101 },
      { filters: [{ field: "amount" as PaymentsFilter["filters"][number]["field"], operator: "contains", value: "1" }] },
      { filters: [{ field: "note", operator: "like" as "contains", value: "1" }] },
    ];
    for (const f of bad) {
      const filter = { ...BASE, ...f };
      await expect(viaDrizzle(asOwner, filter)).rejects.toMatchObject({ status: 400 });
      await expect(viaSql(asOwner, filter)).rejects.toThrow();
    }
  });

  it("the dropdown filters (is, is not, is any of) on Mode, ignoring case", async () => {
    const total = async (filters: PaymentsFilter["filters"]) => (await viaDrizzle(asOwner, { ...BASE, filters })).total;
    const upi = await total([{ field: "mode", operator: "equals", value: "UPI" }]);
    expect(upi).toBeGreaterThan(0);
    expect(await total([{ field: "mode", operator: "is", value: "upi" }])).toBe(upi);
    expect(await total([{ field: "mode", operator: "not", value: "UPI" }])).toBe(6 - upi);
    expect(await total([{ field: "mode", operator: "isAnyOf", value: ["UPI", "Cheque"] }])).toBe(2);
    expect(await total([{ field: "mode", operator: "isAnyOf", value: ["UPI", " "] }])).toBe(upi);
    // No value chosen yet: the filter doesn't filter.
    expect(await total([{ field: "mode", operator: "isAnyOf", value: [] }])).toBe(6);
    expect(await total([{ field: "mode", operator: "is", value: "" }])).toBe(6);
  });

  it("refuses a list for one value, and one value for \"is any of\"", async () => {
    for (const filters of [
      [{ field: "mode", operator: "isAnyOf", value: "UPI" }],
      [{ field: "mode", operator: "is", value: ["UPI"] }],
    ] as PaymentsFilter["filters"][]) {
      await expect(viaDrizzle(asOwner, { ...BASE, filters })).rejects.toMatchObject({ status: 400 });
    }
  });

  it("shows another signed-in account nothing", async () => {
    const page = await same({}, asStranger);
    expect(page).toMatchObject({ rows: [], total: 0, all: 0, page: 0, totals: { amount: 0, count: 0 } });
  });
});

describe("the text the grid searches is the text the UI shows", () => {
  const text = async (expr: ReturnType<typeof sql>) =>
    (await l.rows<{ v: string }>(asOwner, sql`select ${expr} as v`))[0].v;

  it("dates as formatDateKey, months as formatMonth", async () => {
    for (const key of ["2026-01-05", "2026-10-31", "2027-02-28"]) {
      expect(await text(dateLabel(sql`${key}::date`))).toBe(formatDateKey(key));
    }
    for (const key of ["2026-01-01", "2026-05-01", "2026-09-01", "2026-12-01"]) {
      expect(await text(monthLabel(sql`${key}::date`))).toBe(formatMonth(key));
    }
  });

  it("payment modes as paymentModeLabel, unknown ones as Other", async () => {
    for (const mode of [...PAYMENT_MODES, "barter"]) {
      expect(await text(labelOf(sql`${mode}::text`, PAYMENT_MODE_LABELS, PAYMENT_MODE_LABELS.other))).toBe(paymentModeLabel(mode));
    }
  });

  it("towers as tenant_placement_now", async () => {
    for (const id of Object.values(tenants)) {
      const [expected] = await l.rows<{ v: string }>(asOwner, sql`select (tenant_placement_now(${id}::uuid)).property_name as v`);
      expect(await text(towersNow(sql`${id}::uuid`, todayKey()))).toBe(expected.v);
    }
  });
});

describe("tags (0030): on the rows, searched and filtered", () => {
  const tag = (tenant: string, mode: PaymentMode, name: string) =>
    l.pg.query(
      `insert into payment_record_tags (payment_id, name)
       select id, $3 from payments where tenant_id = $1 and mode = $2`,
      [tenant, mode, name]
    );

  beforeAll(async () => {
    await tag(tenants.asha, "upi", "Padma");
    await tag(tenants.asha, "upi", "malati");
    await tag(tenants.bimal, "cheque", "Padma");
  });

  it("each row carries its tags, alphabetical whatever the case", async () => {
    const { rows } = await viaDrizzle(asOwner, BASE);
    expect(rows.find((r) => r.tenant_id === tenants.asha && r.mode === "upi")?.tags).toEqual(["malati", "Padma"]);
    expect(rows.find((r) => r.tenant_id === tenants.bimal && r.mode === "cheque")?.tags).toEqual(["Padma"]);
    expect(rows.find((r) => r.tenant_id === tenants.chai)?.tags).toEqual([]);
  });

  it("search and the Tags filter match a tag's name, and the cards follow", async () => {
    const padma = await viaDrizzle(asOwner, { ...BASE, search: "padma" });
    expect(padma.total).toBe(2);
    expect(padma.totals).toMatchObject({ amount: 14000, by_mode: { upi: 10000, cheque: 4000, cash: 0 } });
    expect((await viaDrizzle(asOwner, { ...BASE, search: "padma malati" })).total).toBe(1);
    const filtered = await viaDrizzle(asOwner, { ...BASE, filters: [{ field: "tags", operator: "contains", value: "MALATI" }] });
    expect(filtered.rows.map((r) => r.mode)).toEqual(["upi"]);
    expect((await viaDrizzle(asOwner, { ...BASE, filters: [{ field: "tags", operator: "isEmpty" }] })).total).toBe(4);
  });

  it("the Tags filter tests each name, not the joined text", async () => {
    const count = async (operator: PaymentsFilter["filters"][number]["operator"], value: string) =>
      (await viaDrizzle(asOwner, { ...BASE, filters: [{ field: "tags", operator, value }] })).total;
    // Asha's UPI payment has two tags: equals still finds it by either one.
    expect(await count("equals", "padma")).toBe(2);
    expect(await count("equals", "MALATI")).toBe(1);
    expect(await count("equals", "Pad")).toBe(0);
    expect(await count("startsWith", "pad")).toBe(2);
    expect(await count("endsWith", "ati")).toBe(1);
    // Nothing matches across the ", " the column shows between names.
    expect(await count("contains", "malati, padma")).toBe(0);
    expect(await count("contains", ", ")).toBe(0);
    expect((await viaDrizzle(asOwner, { ...BASE, filters: [{ field: "tags", operator: "isNotEmpty" }] })).total).toBe(2);
  });

  it("the Tags dropdown: is one of the names, is not any of them, is any of several", async () => {
    const total = async (filter: PaymentsFilter["filters"][number]) =>
      (await viaDrizzle(asOwner, { ...BASE, filters: [filter] })).total;
    expect(await total({ field: "tags", operator: "is", value: "Padma" })).toBe(2);
    // Untagged payments are "not Padma" too.
    expect(await total({ field: "tags", operator: "not", value: "padma" })).toBe(4);
    expect(await total({ field: "tags", operator: "not", value: "Malati" })).toBe(5);
    expect(await total({ field: "tags", operator: "isAnyOf", value: ["Malati", "Nobody"] })).toBe(1);
    expect(await total({ field: "tags", operator: "isAnyOf", value: ["Malati", "Padma"] })).toBe(2);
  });

  it("shows another signed-in account none", async () => {
    expect((await viaDrizzle(asStranger, { ...BASE, search: "padma" })).total).toBe(0);
  });
});
