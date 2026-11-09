// The tenant portal's sessions and phone lookup on a real Postgres (0033,
// D37): who may sign in, and when a session counts as live, decided on the
// database clock.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzleSystemRepositories } from "@/server/adapters/drizzle/repositories/system";
import { asService, createLedgerDb, type LedgerDb } from "./fixtures";

let l: LedgerDb;
let system: ReturnType<typeof drizzleSystemRepositories>;
let asha: string;

const PHONE = "+919876543210";
const days = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();

beforeAll(async () => {
  l = await createLedgerDb();
  system = drizzleSystemRepositories(l.db);
  asha = await l.createTenant({ name: "Asha", rent: 5000, leaseStart: "2026-01-01", units: ["AC-T1-G01"] });
});

afterAll(async () => {
  await l?.close();
});

beforeEach(async () => {
  await l.rows(asService, sql`delete from tenant_sessions`);
});

/** Inserts a session as the given state, straight in SQL (created_at can't be set through the port). */
async function insertSession(hash: string, opts: { createdDaysAgo?: number; expiresInDays: number; revokedDaysAgo?: number }) {
  await l.rows(
    asService,
    sql`insert into tenant_sessions (token_hash, phone, tenant_id, created_at, expires_at, revoked_at)
        values (${hash}, ${PHONE}, ${asha}::uuid,
          now() - make_interval(days => ${opts.createdDaysAgo ?? 0}),
          now() + make_interval(days => ${opts.expiresInDays}),
          ${opts.revokedDaysAgo === undefined ? null : sql`now() - make_interval(days => ${opts.revokedDaysAgo})`})`
  );
}

describe("tenant sessions", () => {
  it("finds a live session by its token hash, never an expired or revoked one", async () => {
    await system.tenantSessions.create({ token_hash: "live", phone: PHONE, tenant_id: asha, expires_at: days(7) });
    await insertSession("expired", { createdDaysAgo: 8, expiresInDays: -1 });
    await insertSession("revoked", { expiresInDays: 6, revokedDaysAgo: 0 });
    expect((await system.tenantSessions.findActive("live"))?.tenant_id).toBe(asha);
    expect(await system.tenantSessions.findActive("expired")).toBeNull();
    expect(await system.tenantSessions.findActive("revoked")).toBeNull();
    expect(await system.tenantSessions.findActive("nope")).toBeNull();
  });

  it("chooses a tenancy only on a live session, and revokes once", async () => {
    await system.tenantSessions.create({ token_hash: "s", phone: PHONE, expires_at: days(7) });
    const session = (await system.tenantSessions.findActive("s"))!;
    expect(session.tenant_id).toBeNull();
    expect(await system.tenantSessions.choose(session.id, asha)).toBe(true);
    await system.tenantSessions.revoke(session.id);
    expect(await system.tenantSessions.choose(session.id, asha)).toBe(false);
    expect(await system.tenantSessions.findActive("s")).toBeNull();
  });

  it("prunes sessions that ended over 30 days ago, by expiry or sign-out", async () => {
    await insertSession("expired-31", { createdDaysAgo: 40, expiresInDays: -31 });
    await insertSession("expired-29", { createdDaysAgo: 36, expiresInDays: -29 });
    await insertSession("revoked-31", { createdDaysAgo: 35, expiresInDays: -28, revokedDaysAgo: 31 });
    await insertSession("live", { expiresInDays: 7 });
    expect(await system.tenantSessions.prune()).toBe(2);
    const left = await l.rows<{ token_hash: string }>(asService, sql`select token_hash from tenant_sessions order by 1`);
    expect(left.map((r) => r.token_hash)).toEqual(["expired-29", "live"]);
  });
});

describe("tenants.listByPhone", () => {
  it("lists active and moved-out tenants with the number, never a draft", async () => {
    const shop = await l.createTenant({ name: "Asha Stores", rent: 3000, leaseStart: "2026-01-01", units: ["AC-T1-G02"], kind: "business" });
    await l.rows(asService, sql`update tenants set status = 'inactive', moved_out_on = '2026-05-31' where id = ${shop}::uuid`);
    const draft = await l.createTenant({ name: "Draft", rent: 1000, leaseStart: "2026-01-01", units: ["AC-T1-G03"] });
    await l.rows(asService, sql`update tenants set status = 'draft' where id = ${draft}::uuid`);
    expect((await system.tenants.listByPhone(PHONE)).map((t) => t.id).sort()).toEqual([asha, shop].sort());
    expect(await system.tenants.listByPhone("+919999999999")).toEqual([]);
  });
});
