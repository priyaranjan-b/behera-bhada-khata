import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

type Schema = typeof schema;
/** Any Drizzle Postgres database over this schema: postgres-js in the app, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

/**
 * The part of the signed-in session's verified JWT that SQL reads: only
 * auth.uid(), i.e. `sub`. Nothing else is passed on, so no email, phone or
 * session id ever goes into a query (or into an error that echoes one).
 */
export type JwtClaims = { sub: string };

/**
 * Who a transaction runs as. The connection logs in as app_drizzle (0027,
 * D32), which may only switch to these roles, so RLS (is_app_owner()), the
 * function grants and auth.uid() (the audit actor) apply exactly as they do
 * for the Supabase clients.
 */
export type Scope =
  | { role: "authenticated"; claims: JwtClaims }
  | { role: "service_role" }
  /**
   * One tenant's own rows, read-only (0033, A32): RLS keys every policy on
   * current_tenant_id(), set here from the verified tenant session, never
   * from request input.
   */
  | { role: "tenant_reader"; tenantId: string };

/**
 * Per role, set per transaction: a role's own `statement_timeout` (0023)
 * applies only at login, not after switching role. The owner keeps 0023's
 * 5s. The service role gets the 8s it had over the Supabase API (the
 * `authenticator` login's limit), never unlimited (A17).
 */
const STATEMENT_TIMEOUT: Record<Scope["role"], string> = { authenticated: "5s", service_role: "8s", tenant_reader: "5s" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in one transaction as `scope`. Every adapter query goes through
 * here: there is no unscoped path to the database.
 *
 * `fn` must await its queries one after another, never `Promise.all` on the
 * same `tx`. Postgres.js pipelines concurrent queries on a connection, and
 * Supabase's transaction pooler doesn't support pipelining (it can hang or
 * mix up replies). A transaction reserves its connection, so queries from
 * other requests are never pipelined onto it.
 */
export function inScope<T>(db: Db, scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sub = scope.role === "authenticated" ? scope.claims.sub : "";
  const claims = sub ? { sub, role: scope.role } : { role: scope.role };
  const tenantId = scope.role === "tenant_reader" ? scope.tenantId : "";
  // Fail closed: a tenant scope without a real id would read nothing anyway, but never run it.
  if (scope.role === "tenant_reader" && !UUID.test(tenantId)) return Promise.reject(new Error("tenant scope needs a tenant id"));
  return db.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('role', ${scope.role}, true),
      set_config('request.jwt.claims', ${JSON.stringify(claims)}, true),
      set_config('request.jwt.claim.sub', ${sub}, true),
      set_config('app.tenant_id', ${tenantId}, true),
      set_config('statement_timeout', ${STATEMENT_TIMEOUT[scope.role]}, true),
      set_config('timezone', 'UTC', true)`);
    return fn(tx as Tx);
  });
}

/**
 * The rows of a raw `sql` statement. postgres-js returns the rows as an
 * array and PGlite as `{ rows }`, so raw SQL never reads either shape directly.
 */
export async function executeRows<T>(tx: Db | Tx, query: SQL): Promise<T[]> {
  const result = (await tx.execute(query)) as unknown;
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

let cached: Db | undefined;

/**
 * Client connections per serverless instance. Supabase suggests 1. A page
 * streams ~6 sections at once (A12), and each holds a connection for its
 * transaction, so a few avoid queuing them. These are client connections
 * to Supavisor, which shares a small pool of real ones.
 */
const POOL_SIZE = 5;

/** Seconds. A pooler that doesn't answer fails a section fast instead of after postgres.js's default 30s. */
const CONNECT_TIMEOUT = 5;
/** Seconds before an idle client connection closes, and before any is replaced. */
const IDLE_TIMEOUT = 20;
const MAX_LIFETIME = 30 * 60;

/**
 * The app's connection, created once per instance: Supabase's shared pooler
 * in transaction mode (port 6543, IPv4, for serverless). That mode keeps no
 * prepared statements (`prepare: false`) and no session state, which is why
 * inScope() sets everything per transaction. TLS is required: the pooler is
 * reached over the internet.
 */
export function drizzleDb(): Db {
  if (cached) return cached;
  const url = env().DATABASE_URL;
  let client: ReturnType<typeof postgres>;
  try {
    client = postgres(url, {
      prepare: false,
      max: POOL_SIZE,
      ssl: "require",
      connect_timeout: CONNECT_TIMEOUT,
      idle_timeout: IDLE_TIMEOUT,
      max_lifetime: MAX_LIFETIME,
    });
  } catch {
    // The parser's own message can quote the URL, password included.
    throw new Error("DATABASE_URL could not be parsed (value not shown)");
  }
  cached = drizzle(client, { schema }) as unknown as Db;
  return cached;
}
