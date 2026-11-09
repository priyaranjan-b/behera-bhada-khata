// inScope (src/server/adapters/drizzle/client.ts) is the only way the Drizzle
// adapter reaches the database. It must keep every guarantee the Supabase
// clients had: RLS refuses anyone but the app owner, auth.uid() is the
// signed-in account (the audit actor), the owner role keeps its 5s statement
// timeout (A17), and nothing leaks out of the transaction.
import type { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/errors";
import { executeRows, inScope, type Db } from "@/server/adapters/drizzle/client";
import { mustWrite } from "@/server/adapters/drizzle/errors";
import * as schema from "@/server/adapters/drizzle/schema";
import { createMigratedDb } from "../../db/pglite";

const OWNER = "00000000-0000-4000-8000-00000000000a";
const STRANGER = "00000000-0000-4000-8000-00000000000b";

let pg: PGlite;
let db: Db;

const asOwner = { role: "authenticated", claims: { sub: OWNER } } as const;
const asStranger = { role: "authenticated", claims: { sub: STRANGER } } as const;

beforeAll(async () => {
  pg = await createMigratedDb();
  await pg.exec(`
    insert into auth.users (id, email) values ('${OWNER}', 'a@example.com'), ('${STRANGER}', 'b@example.com');
    insert into app_owner (user_id) values ('${OWNER}');
    insert into locations (location_code, name) values ('AC', 'Arnapal');
  `);
  db = drizzle(pg, { schema }) as unknown as Db;
});

afterAll(async () => {
  await pg?.close();
});

describe("inScope", () => {
  it("runs as the owner: RLS shows the owner's rows, auth.uid() is the session, 5s timeout", async () => {
    const result = await inScope(db, asOwner, async (tx) => {
      const rows = await tx.select().from(schema.locations);
      const [s] = await executeRows<{ uid: string; owner: boolean; role: string; timeout: string }>(
        tx,
        sql`select auth.uid()::text as uid, is_app_owner() as owner, current_user as role,
              current_setting('statement_timeout') as timeout`
      );
      return { codes: rows.map((r) => r.location_code), ...s };
    });
    expect(result).toEqual({ codes: ["AC"], uid: OWNER, owner: true, role: "authenticated", timeout: "5s" });
  });

  it("passes on only the user id and role, never other claims", async () => {
    const claims = { sub: OWNER, email: "a@example.com", phone: "+919876543210" } as { sub: string };
    const [s] = await inScope(db, { role: "authenticated", claims }, (tx) =>
      executeRows<{ claims: string }>(tx, sql`select current_setting('request.jwt.claims') as claims`)
    );
    expect(JSON.parse(s.claims)).toEqual({ sub: OWNER, role: "authenticated" });
  });

  it("gives the service role an 8s statement timeout, never unlimited", async () => {
    const [s] = await inScope(db, { role: "service_role" }, (tx) =>
      executeRows<{ timeout: string }>(tx, sql`select current_setting('statement_timeout') as timeout`)
    );
    expect(s.timeout).toBe("8s");
  });

  it("shows another signed-in account nothing (RLS fails closed)", async () => {
    const rows = await inScope(db, asStranger, (tx) => tx.select().from(schema.locations));
    expect(rows).toEqual([]);
  });

  it("refuses the owner role a write that isn't granted, mapped like the Supabase adapter", async () => {
    // INSERT on payments is revoked from the owner role (0010): writes go through create_payment.
    const run = inScope(db, asOwner, (tx) => tx.execute(sql`insert into payments (tenant_id) values (gen_random_uuid())`));
    const err = await mustWrite(run, "insert payment").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
  });

  it("maps a BBK SQLSTATE to its status with the function's own message", async () => {
    const run = inScope(db, asStranger, (tx) =>
      tx.execute(sql`select move_out_tenant(gen_random_uuid(), '2026-01-31')`)
    );
    const err = await mustWrite(run, "move out").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(404);
  });

  it("runs the service role past RLS, without an owner", async () => {
    const [row] = await inScope(db, { role: "service_role" }, (tx) =>
      executeRows<{ role: string; uid: string | null }>(tx, sql`select current_user as role, auth.uid()::text as uid`)
    );
    expect(row).toEqual({ role: "service_role", uid: null });
  });

  it("leaves no role or claims behind on the connection", async () => {
    await inScope(db, asOwner, async () => undefined);
    const { rows } = await pg.query<{ role: string; sub: string | null }>(
      `select current_user as role, nullif(current_setting('request.jwt.claim.sub', true), '') as sub`
    );
    expect(rows[0]).toEqual({ role: "postgres", sub: null });
  });
});

describe("inScope as a tenant (0033, A32)", () => {
  const TENANT = "00000000-0000-4000-8000-000000000101";

  it("runs as tenant_reader for that tenant only: no user id, a 5s timeout, nothing left after", async () => {
    const [s] = await inScope(db, { role: "tenant_reader", tenantId: TENANT }, (tx) =>
      executeRows<{ role: string; tenant: string; sub: string; timeout: string }>(
        tx,
        sql`select current_user as role, current_tenant_id()::text as tenant,
              current_setting('request.jwt.claim.sub') as sub, current_setting('statement_timeout') as timeout`
      )
    );
    expect(s).toEqual({ role: "tenant_reader", tenant: TENANT, sub: "", timeout: "5s" });
    // Not even Supabase's auth schema (so auth.uid() and the owner checks) is reachable as a tenant.
    const authSchema = inScope(db, { role: "tenant_reader", tenantId: TENANT }, (tx) => executeRows(tx, sql`select auth.uid()`));
    await expect(authSchema).rejects.toThrow();
    // The setting was local to that transaction.
    const [after] = await executeRows<{ tenant: string }>(db, sql`select coalesce(current_setting('app.tenant_id', true), '') as tenant`);
    expect(after.tenant).toBe("");
  });

  it("can't read the owner's tables", async () => {
    const run = inScope(db, { role: "tenant_reader", tenantId: TENANT }, (tx) => tx.select().from(schema.locations));
    await expect(run).rejects.toThrow();
  });

  it("refuses to run without a real tenant id", async () => {
    await expect(inScope(db, { role: "tenant_reader", tenantId: "" }, async () => 1)).rejects.toThrow(/tenant id/);
    await expect(inScope(db, { role: "tenant_reader", tenantId: "x' or true --" }, async () => 1)).rejects.toThrow(/tenant id/);
  });
});
