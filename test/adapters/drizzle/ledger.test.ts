// Parity for the plain ledger reads moved to Drizzle: rent months, payments,
// adjustments, their allocations and payment proofs.
//
// The oracle is Postgres' own JSON rendering of the same rows (json_agg),
// which is how PostgREST builds what the Supabase adapter receives: numbers
// for numeric, yyyy-MM-dd dates, ISO timestamps. Lists the Supabase adapter
// leaves unordered are compared sorted by id.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDaysToKey, todayKey } from "@/lib/dates";
import type { Scope } from "@/server/adapters/drizzle/client";
import { drizzleOwnerRepositories } from "@/server/adapters/drizzle/repositories/owner";
import type { OwnerRepositories } from "@/server/ports";
import { asOwner, asStranger, createLedgerDb, OWNER, STRANGER, type LedgerDb } from "./fixtures";

const PAYMENT = "00000000-0000-4000-8000-0000000000c1";
const ADJUSTMENT = "00000000-0000-4000-8000-0000000000d1";

let l: LedgerDb;
let asha: string;
let bimal: string;
let ashaMonths: { id: string; period_month: string }[];
let owner: Owner;
let stranger: Owner;

type Owner = Required<{ [K in keyof OwnerRepositories]: Partial<OwnerRepositories[K]> }>;

beforeAll(async () => {
  l = await createLedgerDb();
  asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: "2026-01-15", units: ["AC-T1-G01"] });
  bimal = await l.createTenant({ name: "Bimal", rent: 4250.5, leaseStart: "2026-01-01", units: ["AC-T1-G02"] });
  await l.bill([asha, bimal], "2026-04-01");
  ashaMonths = await l.months(asha);
  const bimalMonths = await l.months(bimal);
  const [jan, feb] = ashaMonths;

  // Asha: January in full and 1000 of February, with two proofs attached.
  const folder = `payments/${asha}/${PAYMENT}/proofs/`;
  const proofs = [
    { storage_path: `${folder}2-receipt.pdf`, file_name: "receipt.pdf", content_type: "application/pdf", size_bytes: 2048 },
    { storage_path: `${folder}1-photo.jpg`, file_name: "photo.jpg", content_type: "image/jpeg", size_bytes: 1024 },
  ];
  const allocations = [
    { rent_period_id: jan.id, amount: 5000 },
    { rent_period_id: feb.id, amount: 1000 },
  ];
  await l.rows(
    asOwner,
    sql`select create_payment(${PAYMENT}::uuid, ${asha}::uuid, 6000, '2026-02-10'::date, 'upi', 'Feb part',
          'sig.png', 'token-c1', now() + interval '14 days', ${JSON.stringify(allocations)}::jsonb,
          ${JSON.stringify(proofs)}::jsonb)`
  );
  // Then 500 of February taken back.
  await l.rows(
    asOwner,
    sql`select create_adjustment(${ADJUSTMENT}::uuid, ${PAYMENT}::uuid, -500, 'Counted twice', 'sig.png',
          'token-d1', now() + interval '14 days', ${JSON.stringify([{ rent_period_id: feb.id, amount: -500 }])}::jsonb)`
  );
  // Bimal: January in full, an older payment.
  await l.pay(bimal, [{ rent_period_id: bimalMonths[0].id, amount: 4250.5 }], "2026-01-05");

  owner = drizzleOwnerRepositories(l.db, { sub: OWNER }) as Owner;
  stranger = drizzleOwnerRepositories(l.db, { sub: STRANGER }) as Owner;
});

afterAll(async () => {
  await l?.close();
});

/** What PostgREST would have sent for `query`, as `scope`. */
async function postgrest(scope: Scope, query: string): Promise<unknown[]> {
  const [row] = await l.rows<{ v: unknown[] }>(scope, sql.raw(`select coalesce(json_agg(t), '[]'::json) as v from (${query}) t`));
  return row.v;
}
const one = async (query: string) => (await postgrest(asOwner, query))[0] ?? null;
const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const ids = (values: string[]) => values.map((v) => `'${v}'`).join(", ");

describe("rent months on Drizzle match what PostgREST returned", () => {
  it("lists months oldest first, then by tenant, with money as numbers and the generated status", async () => {
    const months = await owner.rentPeriods.listForTenants!([asha, bimal]);
    expect(months).toEqual(
      await postgrest(asOwner, `select * from rent_periods where tenant_id in (${ids([asha, bimal])}) order by period_month, tenant_id`)
    );
    expect(months.filter((m) => m.tenant_id === asha).map((m) => [m.period_month, m.amount_allocated, m.status])).toEqual([
      ["2026-01-01", 5000, "paid"],
      ["2026-02-01", 500, "partially_paid"],
      ["2026-03-01", 0, "pending"],
      ["2026-04-01", 0, "pending"],
    ]);
  });

  it("filters: still owed, owed or from a month, and a month range", async () => {
    const where = `tenant_id in (${ids([asha, bimal])})`;
    expect(await owner.rentPeriods.listForTenants!([asha, bimal], { openOnly: true })).toEqual(
      await postgrest(asOwner, `select * from rent_periods where ${where} and status <> 'paid' order by period_month, tenant_id`)
    );
    expect(await owner.rentPeriods.listForTenants!([asha, bimal], { openOrFrom: "2026-01-01" })).toEqual(
      await postgrest(
        asOwner,
        `select * from rent_periods where ${where} and (status <> 'paid' or period_month >= '2026-01-01')
         order by period_month, tenant_id`
      )
    );
    // Both at once are ANDed, as in the Supabase adapter: (owed or from April) within Jan..Apr.
    expect(
      await owner.rentPeriods.listForTenants!([asha, bimal], {
        openOrFrom: "2026-04-01",
        months: { from: "2026-01-01", to: "2026-04-01" },
      })
    ).toEqual(
      await postgrest(
        asOwner,
        `select * from rent_periods where ${where} and (status <> 'paid' or period_month >= '2026-04-01')
         and period_month between '2026-01-01' and '2026-04-01' order by period_month, tenant_id`
      )
    );
    const range = await owner.rentPeriods.listForTenants!([asha], { months: { from: "2026-02-01", to: "2026-03-01" } });
    expect(range.map((m) => m.period_month)).toEqual(["2026-02-01", "2026-03-01"]);
    expect(await owner.rentPeriods.listForTenants!([])).toEqual([]);
  });

  it("gets months by id", async () => {
    const wanted = [ashaMonths[2].id, ashaMonths[0].id];
    expect(byId(await owner.rentPeriods.listByIds!(wanted))).toEqual(
      byId((await postgrest(asOwner, `select * from rent_periods where id in (${ids(wanted)})`)) as { id: string }[])
    );
    expect(await owner.rentPeriods.listByIds!([])).toEqual([]);
  });
});

describe("payments, adjustments and proofs on Drizzle match what PostgREST returned", () => {
  it("payments: by tenant, status and date; one by id or null", async () => {
    const all = await owner.payments.listForTenants!([asha, bimal]);
    expect(byId(all)).toEqual(
      byId((await postgrest(asOwner, `select * from payments where tenant_id in (${ids([asha, bimal])})`)) as { id: string }[])
    );
    expect(all).toHaveLength(2);
    const recent = await owner.payments.listForTenants!([asha, bimal], { status: "confirmed", fromDate: "2026-02-01" });
    expect(recent.map((p) => p.id)).toEqual([PAYMENT]);
    expect(await owner.payments.listForTenants!([asha], { fromDate: "2026-02-11" })).toEqual([]);

    const payment = await owner.payments.get!(PAYMENT);
    expect(payment).toEqual(await one(`select * from payments where id = '${PAYMENT}'`));
    expect(payment?.amount).toBe(6000);
    expect(payment?.payment_date).toBe("2026-02-10");
    expect(payment?.receipt_no).toMatch(/^\d{4}\/\d{2}\/\d{3}$/);
    expect(await owner.payments.get!("00000000-0000-4000-8000-0000000000ff")).toBeNull();
  });

  it("payment allocations: by payment, and by rent month", async () => {
    expect(byId(await owner.payments.listAllocations!(PAYMENT))).toEqual(
      byId((await postgrest(asOwner, `select * from payment_allocations where payment_id = '${PAYMENT}'`)) as { id: string }[])
    );
    const forMonths = await owner.payments.listAllocationsForPeriods!([ashaMonths[1].id]);
    expect(forMonths.map((a) => [a.payment_id, a.amount_allocated])).toEqual([[PAYMENT, 1000]]);
    expect(await owner.payments.listAllocationsForPeriods!([])).toEqual([]);
  });

  it("proofs: in the order attached (by storage path), one by id or null", async () => {
    const proofs = await owner.payments.listProofs!([PAYMENT]);
    expect(proofs).toEqual(await postgrest(asOwner, `select * from payment_proofs where payment_id = '${PAYMENT}' order by storage_path`));
    expect(proofs.map((p) => p.file_name)).toEqual(["photo.jpg", "receipt.pdf"]);
    expect(await owner.payments.getProof!(proofs[0].id)).toEqual(proofs[0]);
    expect(await owner.payments.getProof!("00000000-0000-4000-8000-0000000000ff")).toBeNull();
    expect(await owner.payments.listProofs!([])).toEqual([]);
  });

  it("adjustments: by tenant, status and confirmed day; one by id; their allocations", async () => {
    const all = await owner.adjustments.listForTenants!([asha, bimal]);
    expect(all).toEqual(await postgrest(asOwner, `select * from adjustments where tenant_id in (${ids([asha, bimal])})`));
    expect(all.map((a) => a.delta_amount)).toEqual([-500]);
    // Confirmed now: found from today, gone from tomorrow on.
    expect(await owner.adjustments.listForTenants!([asha], { status: "confirmed", fromDate: todayKey() })).toHaveLength(1);
    expect(await owner.adjustments.listForTenants!([asha], { fromDate: addDaysToKey(todayKey(), 2) })).toEqual([]);

    expect(await owner.adjustments.get!(ADJUSTMENT)).toEqual(await one(`select * from adjustments where id = '${ADJUSTMENT}'`));
    expect(await owner.adjustments.get!("00000000-0000-4000-8000-0000000000ff")).toBeNull();
    const allocations = await owner.adjustments.listAllocations!(ADJUSTMENT);
    expect(allocations).toEqual(await postgrest(asOwner, `select * from adjustment_allocations where adjustment_id = '${ADJUSTMENT}'`));
    expect(allocations.map((a) => a.amount_delta)).toEqual([-500]);
  });
});

describe("the ledger reads show another signed-in account nothing (RLS)", () => {
  it("returns empty lists and nulls", async () => {
    expect(await stranger.rentPeriods.listForTenants!([asha, bimal])).toEqual([]);
    expect(await stranger.rentPeriods.listByIds!([ashaMonths[0].id])).toEqual([]);
    expect(await stranger.payments.listForTenants!([asha])).toEqual([]);
    expect(await stranger.payments.get!(PAYMENT)).toBeNull();
    expect(await stranger.payments.listAllocations!(PAYMENT)).toEqual([]);
    expect(await stranger.payments.listAllocationsForPeriods!([ashaMonths[0].id])).toEqual([]);
    expect(await stranger.payments.listProofs!([PAYMENT])).toEqual([]);
    const [proof] = await owner.payments.listProofs!([PAYMENT]);
    expect(await stranger.payments.getProof!(proof.id)).toBeNull();
    expect(await stranger.adjustments.listForTenants!([asha])).toEqual([]);
    expect(await stranger.adjustments.get!(ADJUSTMENT)).toBeNull();
    expect(await stranger.adjustments.listAllocations!(ADJUSTMENT)).toEqual([]);
    expect(await postgrest(asStranger, `select * from payments`)).toEqual([]);
  });
});
