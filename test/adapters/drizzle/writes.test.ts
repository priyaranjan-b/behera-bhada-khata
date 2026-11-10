// The simple writes moved to Drizzle: owner profile, payment note presets,
// towers and houses, tenant documents. There is no SQL function to compare
// with, so each is checked by what it leaves in the database: the row, the
// audit trail naming the owner (the session's user id reaches the
// triggers), and the same status codes the Supabase adapter's writeError
// gives - 409 for a duplicate, 400 for a missing reference, 403 for anyone
// but the owner.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzleOwnerRepositories } from "@/server/adapters/drizzle/repositories/owner";
import type { OwnerRepositories } from "@/server/ports";
import { asService, createLedgerDb, OWNER, STRANGER, type LedgerDb } from "./fixtures";

type Owner = Required<{ [K in keyof OwnerRepositories]: Partial<OwnerRepositories[K]> }>;

let l: LedgerDb;
let owner: Owner;
let stranger: Owner;
let asha: string;

beforeAll(async () => {
  l = await createLedgerDb();
  owner = drizzleOwnerRepositories(l.db, { sub: OWNER }) as Owner;
  stranger = drizzleOwnerRepositories(l.db, { sub: STRANGER }) as Owner;
  asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: "2026-01-01", units: ["AC-T1-G01"] });
});

afterAll(async () => {
  await l?.close();
});

/** The latest audit entry for a table, as the service role sees it. */
async function lastAudit(entityType: string) {
  const [row] = await l.rows<{ action: string; actor_id: string | null; actor_kind: string }>(
    asService,
    sql`select action, actor_id, actor_kind from audit_log where entity_type = ${entityType} order by id desc limit 1`
  );
  return row;
}

describe("simple writes on Drizzle", () => {
  it("owner profile: creates, then replaces, the one row; audited as the owner", async () => {
    await owner.ownerProfile.save!({ first_name: "Priya", last_name: null, signature_name: null, signature_path: null });
    const first = await owner.ownerProfile.get!();
    expect(first).toMatchObject({ first_name: "Priya", last_name: null });
    expect(await lastAudit("profile")).toMatchObject({ action: "profile.created", actor_id: OWNER, actor_kind: "owner" });
    await owner.ownerProfile.save!({ first_name: "Priya", last_name: "Behera", signature_name: "PB", signature_path: "owner/s.png" });
    const second = await owner.ownerProfile.get!();
    expect(second).toMatchObject({ first_name: "Priya", last_name: "Behera", signature_name: "PB", signature_path: "owner/s.png" });
    expect(second!.updated_at >= first!.updated_at).toBe(true);
    expect(await lastAudit("profile")).toMatchObject({ action: "profile.updated", actor_id: OWNER, actor_kind: "owner" });
    await expect(
      stranger.ownerProfile.save!({ first_name: "X", last_name: null, signature_name: null, signature_path: null })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("payment note presets: add, edit, delete; a duplicate in any case is a 409", async () => {
    await owner.paymentNotePresets.create!("Paid at office");
    const note = (await owner.paymentNotePresets.list!()).find((n) => n.text === "Paid at office")!;
    await expect(owner.paymentNotePresets.create!("paid AT office")).rejects.toMatchObject({ status: 409 });
    expect(await owner.paymentNotePresets.update!(note.id, "Paid at the office")).toBe(true);
    expect((await owner.paymentNotePresets.list!()).some((n) => n.text === "Paid at the office")).toBe(true);
    expect(await owner.paymentNotePresets.remove!(note.id)).toBe(true);
    expect(await owner.paymentNotePresets.remove!(note.id)).toBe(false);
    expect(await owner.paymentNotePresets.update!(note.id, "gone")).toBe(false);
    // Another account sees no row to change (RLS), and may not add one.
    const [kept] = await owner.paymentNotePresets.list!();
    expect(await stranger.paymentNotePresets.update!(kept.id, "hijacked")).toBe(false);
    expect(await stranger.paymentNotePresets.remove!(kept.id)).toBe(false);
    await expect(stranger.paymentNotePresets.create!("spam")).rejects.toMatchObject({ status: 403 });
  });

  it("towers and houses: created with their generated codes; a duplicate is a 409, a missing site a 400", async () => {
    await owner.properties.create!({ property_code: "AC-T9", location_code: "AC", name: "Tower 9" });
    expect(await owner.properties.get!("AC-T9")).toMatchObject({ tower_code: "T9", name: "Tower 9" });
    expect(await lastAudit("property")).toMatchObject({ action: "property.created", actor_id: OWNER });
    await owner.units.create!({ unit_code: "AC-T9-101", property_code: "AC-T9", floor: "1", unit_type: "residential", label: "Flat 101" });
    expect((await owner.units.list!({ propertyCode: "AC-T9" }))[0]).toMatchObject({ house_number: "101", is_active: true });
    expect(await lastAudit("unit")).toMatchObject({ action: "unit.created", actor_id: OWNER });
    await expect(owner.properties.create!({ property_code: "AC-T9", location_code: "AC", name: "Again" })).rejects.toMatchObject({
      status: 409,
    });
    await expect(owner.properties.create!({ property_code: "ZZ-T1", location_code: "ZZ", name: "Nowhere" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      stranger.units.create!({ unit_code: "AC-T9-102", property_code: "AC-T9", floor: null, unit_type: "commercial", label: null })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("tenant documents: add several at once, list oldest first, get, delete; recorded by the owner", async () => {
    const doc = (n: number) => ({
      tenant_id: asha,
      document_type: n === 1 ? "ID proof" : "Agreement",
      storage_path: `tenants/${asha}/documents/${n}-file.pdf`,
      file_name: `file-${n}.pdf`,
      content_type: "application/pdf" as const,
      size_bytes: 1000 * n,
    });
    await owner.tenantDocuments.create!([doc(2), doc(1)]);
    await owner.tenantDocuments.create!([]);
    const docs = await owner.tenantDocuments.list!(asha);
    expect(docs.map((d) => d.file_name)).toEqual(["file-1.pdf", "file-2.pdf"]);
    expect(docs.every((d) => d.recorded_by === OWNER)).toBe(true);
    expect(await owner.tenantDocuments.tenantIdsWithDocuments!()).toEqual([asha]);
    expect(await owner.tenantDocuments.get!(docs[0].id)).toEqual(docs[0]);
    // The same path twice: the whole insert is refused, nothing half-written.
    await expect(owner.tenantDocuments.create!([doc(3), doc(1)])).rejects.toMatchObject({ status: 409 });
    expect(await owner.tenantDocuments.list!(asha)).toHaveLength(2);
    expect(await stranger.tenantDocuments.remove!(docs[0].id)).toBe(false);
    expect(await owner.tenantDocuments.remove!(docs[0].id)).toBe(true);
    expect(await owner.tenantDocuments.get!(docs[0].id)).toBeNull();
    expect(await lastAudit("document")).toMatchObject({ action: "document.deleted", actor_id: OWNER });
    expect(await stranger.tenantDocuments.list!(asha)).toEqual([]);
    expect(await stranger.tenantDocuments.tenantIdsWithDocuments!()).toEqual([]);
  });
});

describe("payment tags on Drizzle (0030)", () => {
  const tagsOf = async (paymentId: string) =>
    (
      await l.rows<{ name: string }>(
        asService,
        sql`select name from payment_record_tags where payment_id = ${paymentId}::uuid order by lower(name)`
      )
    ).map((r) => r.name);
  const suggestions = async () => (await owner.paymentTags.list!()).map((t) => t.name);

  let months: { id: string }[];
  let n = 0;
  /** A new payment through payments.create, with `tags`; its id. */
  async function record(tags: string[], amount = 100) {
    const id = `00000000-0000-4000-8000-${String(900 + ++n).padStart(12, "0")}`;
    await owner.payments.create!(
      {
        id,
        tenant_id: asha,
        amount,
        payment_date: "2026-01-10",
        mode: "cash",
        note: null,
        owner_signature_path: "sig.png",
        token_hash: `hash-${id}`,
        token_expires_at: "2027-01-01T00:00:00Z",
      },
      [{ rent_period_id: months[0].id, amount }],
      [],
      tags
    );
    return id;
  }

  beforeAll(async () => {
    await l.bill([asha], "2026-03-01");
    months = await l.months(asha);
  });

  it("records a payment with its tags in one go; a new name joins the suggestions, a known one keeps its spelling", async () => {
    const id = await record(["padma", "Ravi"]);
    expect(await tagsOf(id)).toEqual(["Padma", "Ravi"]);
    expect(await suggestions()).toEqual(["Malati", "Padma", "Priyaranjan", "RameshSutar", "Ravi", "Sankarshan"]);
    expect((await owner.paymentTags.list!()).find((t) => t.name === "Padma")?.payment_count).toBe(1);
  });

  it("a payment the database refuses leaves no tags and no new suggestion", async () => {
    // More than the month's rent: create_payment refuses it, so the whole transaction goes.
    await expect(record(["Nobody"], 999_999)).rejects.toMatchObject({ status: 400 });
    expect(await suggestions()).not.toContain("Nobody");
    expect((await l.rows<{ c: number }>(asService, sql`select count(*)::int as c from payment_record_tags`))[0].c).toBe(2);
  });

  it("setTags adds and removes; the payment keeps its names when a suggestion is renamed or deleted", async () => {
    const id = await record(["Malati"]);
    expect(await owner.payments.setTags!(id, ["malati", "Sankarshan"])).toEqual(["Malati", "Sankarshan"]);
    expect(await owner.payments.setTags!(id, ["Sankarshan"])).toEqual(["Sankarshan"]);

    const sankarshan = (await owner.paymentTags.list!()).find((t) => t.name === "Sankarshan")!;
    expect(await owner.paymentTags.update!(sankarshan.id, "Sankarshan B")).toBe(true);
    expect(await tagsOf(id)).toEqual(["Sankarshan"]);
    expect(await owner.paymentTags.remove!(sankarshan.id)).toBe(true);
    expect(await tagsOf(id)).toEqual(["Sankarshan"]);
    // Re-saving the payment doesn't bring the deleted suggestion back.
    expect(await owner.payments.setTags!(id, ["Sankarshan", "Padma"])).toEqual(["Padma", "Sankarshan"]);
    expect(await suggestions()).not.toContain("Sankarshan");
    expect(await owner.payments.setTags!(id, [])).toEqual([]);
  });

  it("suggestions: a duplicate in any case is a 409; unknown payment null; another account changes nothing", async () => {
    await expect(owner.paymentTags.create!("PADMA")).rejects.toMatchObject({ status: 409 });
    expect(await owner.payments.setTags!("00000000-0000-4000-8000-000000000999", ["Padma"])).toBeNull();
    const id = await record(["Padma"]);
    expect(await stranger.payments.setTags!(id, [])).toBeNull();
    expect(await tagsOf(id)).toEqual(["Padma"]);
    expect(await stranger.paymentTags.list!()).toEqual([]);
    await expect(stranger.paymentTags.create!("spam")).rejects.toMatchObject({ status: 403 });
  });
});

describe("house rents (D39)", () => {
  const rentsOf = async (codes: string[]) => {
    const units = await owner.units.list!({ unitCodes: codes });
    return Object.fromEntries(units.map((u) => [u.unit_code, u.base_rent === null ? null : Number(u.base_rent)]));
  };
  const newTenant = {
    name: "Chitra",
    business_name: null,
    phone: "+919876543212",
    preferred_channel: "both" as const,
    monthly_rent: 9000,
    lease_start: "2026-02-01",
    unit_codes: ["AC-T1-G03", "AC-T1-G04"],
    paid_through: null,
    deposit_amount: null,
    tenant_kind: "individual" as const,
    rent_tracked: true,
  };

  it("sets several houses in one statement; null clears one; an unknown or unseen house is refused", async () => {
    await owner.units.setRents!([
      { unit_code: "AC-T1-G05", base_rent: 3000 },
      { unit_code: "AC-T1-G06", base_rent: 2500.5 },
    ]);
    expect(await rentsOf(["AC-T1-G05", "AC-T1-G06"])).toEqual({ "AC-T1-G05": 3000, "AC-T1-G06": 2500.5 });
    await owner.units.setRents!([]);
    await owner.units.setRents!([{ unit_code: "AC-T1-G06", base_rent: null }]);
    expect(await rentsOf(["AC-T1-G06"])).toEqual({ "AC-T1-G06": null });
    await expect(owner.units.setRents!([{ unit_code: "AC-T1-G05", base_rent: 0 }])).rejects.toMatchObject({ status: 400 });
    // A house it can't see (another account under RLS, or no such house) is refused, not skipped.
    await expect(stranger.units.setRents!([{ unit_code: "AC-T1-G05", base_rent: 1 }])).rejects.toThrow(/AC-T1-G05/);
    await expect(
      owner.units.setRents!([
        { unit_code: "AC-T1-G05", base_rent: 1 },
        { unit_code: "AC-T1-G99", base_rent: 1 },
      ])
    ).rejects.toThrow(/AC-T1-G99/);
    expect(await rentsOf(["AC-T1-G05"])).toEqual({ "AC-T1-G05": 3000 });
  });

  it("writes them with the tenant, in the same transaction: a refused tenant leaves them as they were", async () => {
    const split = [
      { unit_code: "AC-T1-G03", base_rent: 5000 },
      { unit_code: "AC-T1-G04", base_rent: 4000 },
    ];
    // G01 is Asha's: create_tenant refuses, so the rents aren't written either.
    await expect(owner.tenants.create!({ ...newTenant, unit_codes: ["AC-T1-G01", "AC-T1-G03"] }, split)).rejects.toMatchObject({
      status: 409,
    });
    expect(await rentsOf(["AC-T1-G03", "AC-T1-G04"])).toEqual({ "AC-T1-G03": null, "AC-T1-G04": null });

    const { id } = await owner.tenants.create!(newTenant, split);
    expect(await rentsOf(["AC-T1-G03", "AC-T1-G04"])).toEqual({ "AC-T1-G03": 5000, "AC-T1-G04": 4000 });

    // A bad rent rolls back the tenant write it came with.
    await expect(
      owner.tenants.correctRent!(id, "2026-02-01", 9500, [{ unit_code: "AC-T1-G03", base_rent: -1 }])
    ).rejects.toMatchObject({ status: 400 });
    const [rate] = await l.rows<{ monthly_amount: string }>(
      asService,
      sql`select monthly_amount from tenant_rent_rates where tenant_id = ${id} order by effective_month desc limit 1`
    );
    expect(Number(rate.monthly_amount)).toBe(9000);
  });
});
