// Parity for the plain table reads moved to Drizzle (queue item 2): owner
// profile, payment note presets, locations, properties, units, occupancy,
// tenants and rent rates.
//
// The oracle is Postgres' own JSON rendering of the same rows (json_agg),
// which is how PostgREST builds what the Supabase adapter receives: numbers
// for numeric, yyyy-MM-dd dates, ISO timestamps. So each Drizzle result must
// deep-equal what `db.from(table).select("*")` returned, value and type.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Scope } from "@/server/adapters/drizzle/client";
import { drizzleOwnerRepositories } from "@/server/adapters/drizzle/repositories/owner";
import type { OwnerRepositories } from "@/server/ports";
import { asOwner, asStranger, createLedgerDb, OWNER, STRANGER, type LedgerDb } from "./fixtures";

let l: LedgerDb;
let asha: string;
let bimal: string;
let owner: ReturnType<typeof drizzleOwnerRepositories>;
let stranger: ReturnType<typeof drizzleOwnerRepositories>;

beforeAll(async () => {
  l = await createLedgerDb();
  await l.pg.exec(`
    insert into properties (property_code, location_code, name) values ('AC-T2', 'AC', 'Tower 2');
    insert into units (unit_code, property_code, floor, unit_type, label) values ('AC-T2-101', 'AC-T2', '1', 'residential', 'Flat 101');
    insert into owner_profile (first_name, last_name) values ('Priya', 'Behera');
    insert into payment_note_presets (text) values ('UPI ref'), ('Advance'), ('cash at office');
  `);
  asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: "2026-01-15", units: ["AC-T1-G01", "AC-T1-G03"] });
  bimal = await l.createTenant({ name: "Bimal", rent: 4250.5, leaseStart: "2026-02-01", units: ["AC-T2-101"] });
  // Asha's rent goes up from April: two dated rates.
  await l.rows(asOwner, sql`select update_tenant(${asha}::uuid, 'Asha', null, '+919876543210', 'both',
    array['AC-T1-G01','AC-T1-G03'], '2026-04-01', 5500, '2026-04-01', '2026-01-15', null, null, 'individual', true)`);
  owner = drizzleOwnerRepositories(l.db, { sub: OWNER });
  stranger = drizzleOwnerRepositories(l.db, { sub: STRANGER });
});

afterAll(async () => {
  await l?.close();
});

/** What PostgREST would have sent for `query`, as `scope`. */
async function postgrest(scope: Scope, query: string): Promise<unknown> {
  const [row] = await l.rows<{ v: unknown }>(scope, sql.raw(`select coalesce(json_agg(t), '[]'::json) as v from (${query}) t`));
  return row.v;
}
const one = async (scope: Scope, query: string) => ((await postgrest(scope, query)) as unknown[])[0] ?? null;

type Owner = Required<{ [K in keyof OwnerRepositories]: Partial<OwnerRepositories[K]> }>;
const o = () => owner as Owner;
const s = () => stranger as Owner;

describe("plain reads on Drizzle match what PostgREST returned", () => {
  it("owner profile: the one row, or null for anyone else", async () => {
    expect(await o().ownerProfile.get!()).toEqual(await one(asOwner, `select * from owner_profile`));
    expect(await s().ownerProfile.get!()).toBeNull();
  });

  it("payment note presets: alphabetical, as Postgres sorts text", async () => {
    const notes = await o().paymentNotePresets.list!();
    expect(notes).toEqual(await postgrest(asOwner, `select * from payment_note_presets order by text`));
    // 0024 seeds a few defaults; the three added here are among them.
    expect(notes.map((n) => n.text)).toEqual(expect.arrayContaining(["Advance", "UPI ref", "cash at office"]));
  });

  it("locations and properties: by code; get by code or null", async () => {
    expect(await o().locations.list!()).toEqual(await postgrest(asOwner, `select * from locations order by location_code`));
    expect(await o().properties.list!()).toEqual(await postgrest(asOwner, `select * from properties order by property_code`));
    const t1 = await o().properties.get!("AC-T1");
    expect(t1).toEqual(await one(asOwner, `select * from properties where property_code = 'AC-T1'`));
    expect(t1?.tower_code).toBe("T1");
    expect(await o().properties.get!("ZZ-T9")).toBeNull();
  });

  it("units: all by code, one tower, or the listed codes in the Supabase adapter's order", async () => {
    expect(await o().units.list!()).toEqual(await postgrest(asOwner, `select * from units order by unit_code`));
    expect(await o().units.list!({ propertyCode: "AC-T2" })).toEqual(
      await postgrest(asOwner, `select * from units where property_code = 'AC-T2' order by unit_code`)
    );
    const listed = await o().units.list!({ unitCodes: ["AC-T2-101", "AC-T1-G03", "AC-T1-G01"] });
    expect(listed.map((u) => u.unit_code)).toEqual(["AC-T1-G01", "AC-T1-G03", "AC-T2-101"]);
    expect(await o().units.list!({ unitCodes: [] })).toEqual([]);
  });

  it("occupancy: oldest tenancy first, by tenant or by tower", async () => {
    expect(await o().occupancy.list!()).toEqual(await postgrest(asOwner, `select * from unit_occupancy order by start_date, unit_code`));
    expect(await o().occupancy.list!({ tenantIds: [bimal] })).toEqual(
      await postgrest(asOwner, `select * from unit_occupancy where tenant_id = '${bimal}' order by start_date, unit_code`)
    );
    expect(await o().occupancy.list!({ propertyCode: "AC-T2" })).toEqual(
      await postgrest(asOwner, `select * from unit_occupancy where property_code = 'AC-T2' order by start_date, unit_code`)
    );
    expect(await o().occupancy.list!({ tenantIds: [] })).toEqual([]);
    // Asha's two houses start the same day: the house code breaks the tie, every time.
    const ashas = await o().occupancy.list!({ tenantIds: [asha] });
    expect(ashas.map((r) => [r.start_date, r.unit_code])).toEqual([
      ["2026-01-15", "AC-T1-G01"],
      ["2026-01-15", "AC-T1-G03"],
    ]);
  });

  it("tenants: oldest first, by status, one by id or null", async () => {
    expect(await o().tenants.list!()).toEqual(await postgrest(asOwner, `select * from tenants order by created_at, id`));
    expect(await o().tenants.list!({ status: "draft" })).toEqual([]);
    expect(await o().tenants.get!(asha)).toEqual(await one(asOwner, `select * from tenants where id = '${asha}'`));
    expect(await o().tenants.get!("00000000-0000-4000-8000-0000000000ff")).toBeNull();
  });

  it("rent rates: oldest first, money as numbers like PostgREST sends", async () => {
    const rates = await o().rentRates.listForTenants!([asha, bimal]);
    expect(rates).toEqual(
      await postgrest(asOwner, `select * from tenant_rent_rates where tenant_id in ('${asha}', '${bimal}') order by effective_month, id`)
    );
    expect(rates.map((r) => r.monthly_amount)).toEqual([5000, 4250.5, 5500]);
    expect(typeof rates[0].monthly_amount).toBe("number");
    expect(await o().rentRates.listForTenants!([])).toEqual([]);
  });

  it("dates are yyyy-MM-dd keys and timestamps ISO with an offset, as before", async () => {
    const tenant = await o().tenants.get!(asha);
    expect(tenant?.lease_start).toBe("2026-01-15");
    expect(tenant?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+00:00$/);
  });

  it("shows another signed-in account nothing (RLS)", async () => {
    expect(await s().paymentNotePresets.list!()).toEqual([]);
    expect(await s().locations.list!()).toEqual([]);
    expect(await s().properties.list!()).toEqual([]);
    expect(await s().properties.get!("AC-T1")).toBeNull();
    expect(await s().units.list!()).toEqual([]);
    expect(await s().occupancy.list!()).toEqual([]);
    expect(await s().tenants.list!()).toEqual([]);
    expect(await s().tenants.get!(asha)).toBeNull();
    expect(await s().rentRates.listForTenants!([asha])).toEqual([]);
  });

  it("and a stranger's oracle is empty too, so the comparison is fair", async () => {
    expect(await postgrest(asStranger, `select * from tenants`)).toEqual([]);
  });
});
