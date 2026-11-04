// The Maintenance page query (0031, D35) and the maintenance writes, on a
// migrated PGlite: paging, search, filters (tags name by name), sort, the
// totals (voided expenses listed but never counted) and RLS.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inScope, type Scope } from "@/server/adapters/drizzle/client";
import { createMaintenanceExpense, voidMaintenanceExpense } from "@/server/adapters/drizzle/procedures/maintenance";
import { maintenancePage } from "@/server/adapters/drizzle/queries/maintenancePage";
import { getMaintenanceExpense } from "@/server/adapters/drizzle/tables/maintenance";
import { setRecordTags } from "@/server/adapters/drizzle/tables/paymentTags";
import type { MaintenanceExpenseFields, MaintenanceFilter } from "@/server/ports";
import { asOwner, asStranger, createLedgerDb, type LedgerDb } from "../fixtures";

let l: LedgerDb;
const ids = {
  tap: "00000000-0000-4000-8000-0000000000a1",
  paint: "00000000-0000-4000-8000-0000000000a2",
  tax: "00000000-0000-4000-8000-0000000000a3",
  wrong: "00000000-0000-4000-8000-0000000000a4",
  old: "00000000-0000-4000-8000-0000000000a5",
};

const fields = (f: Partial<MaintenanceExpenseFields>): MaintenanceExpenseFields => ({
  expense_date: "2026-03-05",
  amount: 1000,
  category: "plumbing",
  description: "Tap repair",
  vendor: null,
  note: null,
  ...f,
});

beforeAll(async () => {
  l = await createLedgerDb();
  await inScope(l.db, asOwner, async (tx) => {
    await createMaintenanceExpense(tx, ids.tap, fields({ vendor: "Ramesh plumber" }), ["AC-T1-G01"], ["Padma"], [
      {
        expense_id: ids.tap,
        storage_path: `maintenance/${ids.tap}/files/0-bill.pdf`,
        file_name: "bill.pdf",
        content_type: "application/pdf",
        size_bytes: 1200,
      },
    ]);
    await createMaintenanceExpense(
      tx,
      ids.paint,
      fields({ expense_date: "2026-03-10", amount: 9000, category: "painting", description: "Repaint 50% of walls" }),
      ["AC-T1-G02", "AC-T1-G03", "AC-T1-G01"],
      ["Padma", "Malati"],
      []
    );
    await createMaintenanceExpense(
      tx,
      ids.tax,
      fields({ expense_date: "2026-03-20", amount: 2400, category: "property_tax", description: "Holding tax" }),
      ["AC-T1-G04"],
      [],
      []
    );
    await createMaintenanceExpense(tx, ids.wrong, fields({ expense_date: "2026-03-21", amount: 500 }), ["AC-T1-G05"], ["Padma"], []);
    await voidMaintenanceExpense(tx, ids.wrong, "Entered twice");
    await createMaintenanceExpense(tx, ids.old, fields({ expense_date: "2026-01-02" }), ["AC-T1-G06"], [], []);
  });
});

afterAll(async () => {
  await l?.close();
});

const BASE: MaintenanceFilter = {
  from: "2026-03-01",
  to: "2026-03-31",
  filters: [],
  logic: "and",
  sort: "expense_date",
  dir: "desc",
  page: 0,
  pageSize: 10,
};

const page = (f: Partial<MaintenanceFilter> = {}, scope: Scope = asOwner) =>
  inScope(l.db, scope, (tx) => maintenancePage(tx, { ...BASE, ...f }));

describe("maintenancePage", () => {
  it("lists the days' expenses newest first, voided ones too, and totals only what counts", async () => {
    const result = await page();
    expect(result.rows.map((r) => r.id)).toEqual([ids.wrong, ids.tax, ids.paint, ids.tap]);
    expect(result).toMatchObject({ total: 4, all: 4, page: 0 });
    expect(result.rows[0]).toMatchObject({ voided: true, amount: 500 });
    expect(result.rows.find((r) => r.id === ids.paint)).toMatchObject({
      unit_codes: ["AC-T1-G01", "AC-T1-G02", "AC-T1-G03"],
      tags: ["Malati", "Padma"],
      file_count: 0,
    });
    expect(result.rows.find((r) => r.id === ids.tap)).toMatchObject({ file_count: 1, vendor: "Ramesh plumber", expense_date: "2026-03-05" });
    expect(result.totals).toEqual({
      amount: 12400,
      cash: 12400,
      count: 3,
      by_category: { plumbing: 1000, painting: 9000, property_tax: 2400 },
      by_tag: [
        { name: "Padma", amount: 10000 },
        { name: "Malati", amount: 9000 },
      ],
      untagged: 2400,
    });
  });

  it("searches every shown text, with % literal, and the totals follow", async () => {
    expect((await page({ search: "g04" })).rows.map((r) => r.id)).toEqual([ids.tax]);
    expect((await page({ search: "50%" })).rows.map((r) => r.id)).toEqual([ids.paint]);
    expect((await page({ search: "%" })).rows.map((r) => r.id)).toEqual([ids.paint]);
    const plumber = await page({ search: "ramesh" });
    expect(plumber.rows.map((r) => r.id)).toEqual([ids.tap]);
    expect(plumber.totals.amount).toBe(1000);
    expect((await page({ search: "property tax" })).rows.map((r) => r.id)).toEqual([ids.tax]);
  });

  it("filters tags name by name, category and status by label", async () => {
    const tagged = await page({ filters: [{ field: "tags", operator: "is", value: "Malati" }] });
    expect(tagged.rows.map((r) => r.id)).toEqual([ids.paint]);
    const category = await page({ filters: [{ field: "category", operator: "isAnyOf", value: ["Plumbing", "Property tax"] }] });
    expect(category.rows.map((r) => r.id)).toEqual([ids.wrong, ids.tax, ids.tap]);
    const voided = await page({ filters: [{ field: "status", operator: "is", value: "Voided" }] });
    expect(voided.rows.map((r) => r.id)).toEqual([ids.wrong]);
    expect(voided.totals.amount).toBe(0);
  });

  it("sorts either way and pages, clamping past the end", async () => {
    expect((await page({ sort: "amount", dir: "asc" })).rows.map((r) => r.amount)).toEqual([500, 1000, 2400, 9000]);
    expect((await page({ sort: "units_text", dir: "desc" })).rows[0].id).toBe(ids.wrong);
    const last = await page({ pageSize: 10, page: 7 });
    expect(last.page).toBe(0);
    expect((await page({ from: "2026-01-01", to: "2026-01-31" })).rows.map((r) => r.id)).toEqual([ids.old]);
  });

  it("refuses a bad range or sort, and shows anyone but the owner nothing", async () => {
    await expect(page({ from: "2026-04-01", to: "2026-03-01" })).rejects.toMatchObject({ status: 400 });
    await expect(page({ sort: "nope" as MaintenanceFilter["sort"] })).rejects.toMatchObject({ status: 400 });
    expect(await page({}, asStranger)).toMatchObject({ rows: [], total: 0, all: 0, totals: { amount: 0, count: 0 } });
  });
});

describe("maintenance record", () => {
  it("reads an expense with its houses, towers, tags and files", async () => {
    const record = await inScope(l.db, asOwner, (tx) => getMaintenanceExpense(tx, ids.paint));
    expect(record?.expense).toMatchObject({ amount: 9000, category: "painting", voided_at: null });
    expect(record?.units).toEqual([
      { unit_code: "AC-T1-G01", share_amount: 3000, property_code: "AC-T1", property_name: "Tower 1", label: null },
      { unit_code: "AC-T1-G02", share_amount: 3000, property_code: "AC-T1", property_name: "Tower 1", label: null },
      { unit_code: "AC-T1-G03", share_amount: 3000, property_code: "AC-T1", property_name: "Tower 1", label: null },
    ]);
    expect(record?.tags).toEqual(["Malati", "Padma"]);
    expect(await inScope(l.db, asStranger, (tx) => getMaintenanceExpense(tx, ids.paint))).toBeNull();
  });

  it("sets who paid like a payment's tags: the suggestion's spelling, new names join the suggestions", async () => {
    const tags = await inScope(l.db, asOwner, (tx) => setRecordTags(tx, "maintenance", ids.tax, ["padma", "Gopal"]));
    expect(tags).toEqual(["Gopal", "Padma"]);
    const [{ n }] = await l.pg.query<{ n: number }>(`select count(*)::int as n from payment_tags where name = 'Gopal'`).then((r) => r.rows);
    expect(n).toBe(1);
    expect(await inScope(l.db, asOwner, (tx) => setRecordTags(tx, "maintenance", "00000000-0000-4000-8000-000000000999", []))).toBeNull();
  });
});
