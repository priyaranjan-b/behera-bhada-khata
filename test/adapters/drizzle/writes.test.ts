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
