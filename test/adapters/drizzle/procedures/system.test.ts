// The system side on Drizzle (service_role, A19): rent-month upkeep, the
// confirm link's lookups and acknowledgement, audit events, and the plain
// reads the confirm flow and cron need; plus the owner's audit.list and
// audit.log. The SQL functions' rules are covered by test/schema.test.ts;
// these pin the calls and the results' shapes.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzleOwnerRepositories } from "@/server/adapters/drizzle/repositories/owner";
import { drizzleSystemRepositories } from "@/server/adapters/drizzle/repositories/system";
import type { OwnerRepositories, SystemRepositories } from "@/server/ports";
import { asService, createLedgerDb, OWNER, STRANGER, type LedgerDb } from "../fixtures";

const PAYMENT = "00000000-0000-4000-8000-0000000000a1";

let l: LedgerDb;
let system: SystemRepositories;
let owner: OwnerRepositories;
let stranger: OwnerRepositories;
let asha: string;

beforeAll(async () => {
  l = await createLedgerDb();
  system = drizzleSystemRepositories(l.db);
  owner = drizzleOwnerRepositories(l.db, { sub: OWNER });
  stranger = drizzleOwnerRepositories(l.db, { sub: STRANGER });
  asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: "2026-01-01", units: ["AC-T1-G01"] });
});

afterAll(async () => {
  await l?.close();
});

/** What PostgREST would have sent for `query`, as the service role. */
async function postgrest(query: string): Promise<unknown[]> {
  const [row] = await l.rows<{ v: unknown[] }>(asService, sql.raw(`select coalesce(json_agg(t), '[]'::json) as v from (${query}) t`));
  return row.v;
}

describe("system methods on Drizzle", () => {
  it("creates the missing rent months, and none the second time", async () => {
    expect(await system.rentPeriods.ensure([asha], "2026-03-01")).toBe(3);
    expect(await system.rentPeriods.ensure([asha], "2026-03-01")).toBe(0);
    expect(await system.rentPeriods.ensure([], "2026-03-01")).toBe(0);
    expect(await system.rentPeriods.ensure(null, "2026-04-01")).toBe(1);
    const months = await l.months(asha);
    expect(await system.rentPeriods.listByIds([months[0].id])).toEqual(
      await postgrest(`select * from rent_periods where id = '${months[0].id}'`)
    );
  });

  it("finds a record by its link's token hash, acknowledges it once", async () => {
    const months = await l.months(asha);
    await owner.payments.create(
      {
        id: PAYMENT,
        tenant_id: asha,
        amount: 5000,
        payment_date: "2026-01-05",
        mode: "cash",
        note: null,
        owner_signature_path: "o.png",
        token_hash: "link-hash-a1",
        token_expires_at: "2026-12-31T00:00:00.000Z",
      },
      [{ rent_period_id: months[0].id, amount: 5000 }]
    );
    const found = await system.payments.findByTokenHash("link-hash-a1");
    expect(found).toEqual(await postgrest(`select * from payments where id = '${PAYMENT}'`).then((r) => r[0]));
    expect(await system.payments.findByTokenHash("no-such-hash")).toBeNull();
    expect(await system.payments.get(PAYMENT)).toEqual(found);
    expect(await system.payments.listAllocations(PAYMENT)).toHaveLength(1);
    expect(await system.payments.listProofs([PAYMENT])).toEqual([]);
    expect(await system.payments.listProofs([])).toEqual([]);

    const patch = { tenant_signature_path: "t.png", pdf_path: "r.pdf", otp_verified_at: "2026-01-05T10:00:00.000Z" };
    expect(await system.payments.acknowledge(PAYMENT, patch)).toBe(true);
    // A racing second acknowledgement loses.
    expect(await system.payments.acknowledge(PAYMENT, patch)).toBe(false);
    expect(await system.payments.get(PAYMENT)).toMatchObject({ tenant_signature_path: "t.png", pdf_path: "r.pdf" });
    expect(await system.adjustments.findByTokenHash("no-such-hash")).toBeNull();
  });

  it("reads a tenant, their houses, a tower and a site", async () => {
    expect(await system.tenants.get(asha)).toMatchObject({ name: "Asha" });
    expect((await system.occupancy.listForTenant(asha)).map((o) => o.unit_code)).toEqual(["AC-T1-G01"]);
    expect(await system.properties.get("AC-T1")).toMatchObject({ tower_code: "T1" });
    expect(await system.locations.get("AC")).toMatchObject({ name: "Arnapal Chakk Complex" });
    expect(await system.locations.get("ZZ")).toBeNull();
  });

  it("logs events for the system or the tenant, and for the owner as the session", async () => {
    await system.audit.log({ action: "auth.sign_in_failed", context: { reason: "wrong password" }, actorKind: "visitor" });
    await system.audit.log({ action: "receipt.downloaded", tenantId: asha, entityType: "payment", entityId: PAYMENT, actorKind: "tenant" });
    await owner.audit.log({ action: "receipt.downloaded", tenantId: asha, entityType: "payment", entityId: PAYMENT });
    const rows = await l.rows<{ action: string; actor_kind: string; actor_id: string | null }>(
      asService,
      sql`select action, actor_kind, actor_id::text as actor_id from audit_log where action in ('auth.sign_in_failed', 'receipt.downloaded') order by id`
    );
    expect(rows).toEqual([
      { action: "auth.sign_in_failed", actor_kind: "visitor", actor_id: null },
      { action: "receipt.downloaded", actor_kind: "tenant", actor_id: null },
      { action: "receipt.downloaded", actor_kind: "owner", actor_id: OWNER },
    ]);
  });
});

describe("a system write the login may not make", () => {
  it("is a 500 that says to run 0028, never the owner-facing 403", async () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args.join(" "));
    await l.pg.exec(`revoke service_role from app_drizzle; set session authorization app_drizzle`);
    try {
      const failure = await system.payments
        .acknowledge(PAYMENT, { tenant_signature_path: "t.png", pdf_path: "r.pdf", otp_verified_at: "2026-01-05T10:00:00.000Z" })
        .catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toHaveProperty("status");
      expect(errors.join(" | ")).toContain("run migration 0028");
    } finally {
      console.error = original;
      await l.pg.exec(`reset role; set session authorization postgres; grant service_role to app_drizzle with inherit false, set true`);
    }
  });
});

describe("the owner's audit.list on Drizzle", () => {
  it("newest first, by tenant, house, tower, actions, days and beforeId", async () => {
    const all = await owner.audit.list({ limit: 100 });
    expect(all).toEqual(await postgrest(`select * from audit_log order by id desc limit 100`));
    expect(await owner.audit.list({ tenantId: asha, limit: 3 })).toEqual(
      await postgrest(`select * from audit_log where tenant_id = '${asha}' order by id desc limit 3`)
    );
    expect((await owner.audit.list({ unitCode: "AC-T1-G01", limit: 100 })).every((r) => r.unit_code === "AC-T1-G01")).toBe(true);
    expect((await owner.audit.list({ propertyCode: "AC-T1", limit: 100 })).length).toBeGreaterThan(0);
    expect((await owner.audit.list({ actions: ["receipt.downloaded"], limit: 100 })).map((r) => r.action)).toEqual([
      "receipt.downloaded",
      "receipt.downloaded",
    ]);
    const below = await owner.audit.list({ beforeId: all[1].id, limit: 100 });
    expect(below[0].id).toBe(all[2].id);
    // Kolkata days, at the instants either side of midnight there (18:30 UTC). The log
    // refuses every change (D25), so these two are dated with triggers off.
    await l.pg.exec(`set session_replication_role = replica`);
    await l.pg.exec(`
      insert into audit_log (tx_id, actor_kind, action, entity_type, title, details, actor_name, at) values
        (1, 'system', 'auth.sign_in', 'session', 't', 'd', 'System', '2026-03-04T18:29:59.999Z'),
        (2, 'system', 'auth.sign_in', 'session', 't', 'd', 'System', '2026-03-04T18:30:00Z');
    `);
    await l.pg.exec(`set session_replication_role = origin`);
    const at = async (f: { fromDate?: string; toDate?: string }) =>
      (await owner.audit.list({ ...f, actions: ["auth.sign_in"], limit: 100 })).map((r) => r.at);
    expect(await at({ fromDate: "2026-03-04", toDate: "2026-03-04" })).toEqual(["2026-03-04T18:29:59.999+00:00"]);
    expect(await at({ fromDate: "2026-03-05", toDate: "2026-03-05" })).toEqual(["2026-03-04T18:30:00+00:00"]);
    expect(await at({ toDate: "2026-03-03" })).toEqual([]);
    expect(await stranger.audit.list({ limit: 100 })).toEqual([]);
  });

  it("the owner's audit.log as anyone else is refused (BBK04 -> 404), an unknown event a 400", async () => {
    await expect(stranger.audit.log({ action: "auth.signed_out" })).rejects.toMatchObject({ status: 404, message: "Not allowed" });
    await expect(owner.audit.log({ action: "made.up" as "auth.signed_out" })).rejects.toMatchObject({ status: 400 });
  });
});
