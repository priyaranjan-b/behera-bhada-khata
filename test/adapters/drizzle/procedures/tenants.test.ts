// The tenant lifecycle on Drizzle calls the SQL functions that stay in
// Postgres (create_tenant, update_tenant, move_out_tenant,
// correct_paid_through, correct_rent, start/stop_rent_tracking). The rules
// are theirs and test/schema.test.ts covers them; these tests pin the call:
// each argument reaches its parameter, the dates they return come back as
// yyyy-MM-dd keys, and their BBK errors keep their status and message.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzleOwnerRepositories } from "@/server/adapters/drizzle/repositories/owner";
import type { NewTenant, OwnerRepositories } from "@/server/ports";
import { asOwner, createLedgerDb, OWNER, STRANGER, type LedgerDb } from "../fixtures";

let l: LedgerDb;
let owner: OwnerRepositories;
let stranger: OwnerRepositories;

beforeAll(async () => {
  l = await createLedgerDb();
  owner = drizzleOwnerRepositories(l.db, { sub: OWNER });
  stranger = drizzleOwnerRepositories(l.db, { sub: STRANGER });
});

afterAll(async () => {
  await l?.close();
});

const newTenant = (over: Partial<NewTenant> = {}): NewTenant => ({
  name: "Asha",
  business_name: "Asha Stores",
  phone: "+919876543210",
  preferred_channel: "sms",
  monthly_rent: 5000,
  lease_start: "2026-01-10",
  unit_codes: ["AC-T1-G01", "AC-T1-G02"],
  paid_through: "2026-01-01",
  deposit_amount: 10000,
  tenant_kind: "business",
  rent_tracked: true,
  ...over,
});

describe("tenant lifecycle on Drizzle calls the SQL functions", () => {
  it("creates a tenant with every field in its place", async () => {
    const { id } = await owner.tenants.create(newTenant());
    expect(await owner.tenants.get(id)).toMatchObject({
      name: "Asha",
      business_name: "Asha Stores",
      phone: "+919876543210",
      preferred_channel: "sms",
      lease_start: "2026-01-10",
      deposit_amount: 10000,
      tenant_kind: "business",
      rent_tracked: true,
      status: "active",
      // Paid up to January: billed from February.
      billing_start: "2026-02-01",
    });
    expect((await owner.occupancy.list({ tenantIds: [id] })).map((o) => o.unit_code)).toEqual(["AC-T1-G01", "AC-T1-G02"]);
    expect((await owner.rentRates.listForTenants([id])).map((r) => r.monthly_amount)).toEqual([5000]);
  });

  it("refuses a house that is taken (BBK09 -> 409, the function's own message)", async () => {
    await expect(owner.tenants.create(newTenant({ name: "Bimal", unit_codes: ["AC-T1-G01"] }))).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("AC-T1-G01 is occupied"),
    });
    await expect(stranger.tenants.create(newTenant({ unit_codes: ["AC-T1-G05"] }))).rejects.toMatchObject({ status: 404 });
  });

  it("updates, corrects paid-up-to and rent, and moves out", async () => {
    const { id } = await owner.tenants.create(newTenant({ name: "Chai", business_name: null, unit_codes: ["AC-T1-G03"], tenant_kind: "individual" }));
    await owner.tenants.update(id, {
      name: "Chai Wala",
      business_name: null,
      phone: "+919800000000",
      preferred_channel: "whatsapp",
      unit_codes: ["AC-T1-G03", "AC-T1-G04"],
      units_effective: "2026-03-01",
      monthly_rent: 6000,
      rent_effective_month: "2026-04-01",
      lease_start: null,
      paid_through: null,
      deposit_amount: 10000,
      tenant_kind: null,
      rent_tracked: null,
    });
    expect(await owner.tenants.get(id)).toMatchObject({ name: "Chai Wala", phone: "+919800000000", preferred_channel: "whatsapp" });
    expect((await owner.rentRates.listForTenants([id])).map((r) => [r.effective_month, r.monthly_amount])).toEqual([
      ["2026-02-01", 5000],
      ["2026-04-01", 6000],
    ]);
    // Returns the new billing start as a month key.
    expect(await owner.tenants.correctPaidThrough(id, "2026-02-01")).toBe("2026-03-01");
    await owner.tenants.correctRent(id, "2026-03-01", 5500);
    const [rate] = (await owner.rentRates.listForTenants([id])).filter((r) => r.effective_month === "2026-03-01");
    expect(rate?.monthly_amount).toBe(5500);
    await owner.tenants.moveOut(id, "2026-05-31");
    expect(await owner.tenants.get(id)).toMatchObject({ status: "inactive", moved_out_on: "2026-05-31" });
  });

  it("starts and stops tracking a government tenant's rent", async () => {
    const { id } = await owner.tenants.create(
      newTenant({
        name: "Block Office",
        business_name: null,
        phone: null,
        unit_codes: ["AC-T1-G05"],
        paid_through: null,
        deposit_amount: null,
        tenant_kind: "government",
        rent_tracked: false,
        monthly_rent: 20000,
      })
    );
    expect(await owner.tenants.startRentTracking(id, 20000, "2026-03-01")).toBe("2026-04-01");
    expect(await owner.tenants.get(id)).toMatchObject({ rent_tracked: true, billing_start: "2026-04-01" });
    await owner.tenants.stopRentTracking(id);
    expect(await owner.tenants.get(id)).toMatchObject({ rent_tracked: false, billing_start: null });
    // Stopping again: the function's own refusal.
    await expect(owner.tenants.stopRentTracking(id)).rejects.toMatchObject({
      status: 409,
      message: "This tenant's rent isn't tracked",
    });
  });

  it("the audit trail names the owner for every lifecycle write", async () => {
    const rows = await l.rows<{ actor: string | null }>(
      asOwner,
      sql`select distinct actor_id::text as actor from audit_log where entity_type in ('tenant', 'tenancy', 'rent_rate')`
    );
    expect(rows).toEqual([{ actor: OWNER }]);
  });
});
