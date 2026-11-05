// A migrated PGlite with an owner, a tower of six houses and helpers that
// write through the SQL functions, the way the app does. The Drizzle query
// tests read it twice: through the SQL function being replaced (the oracle)
// and through the Drizzle query, and expect the same answer.
import type { PGlite } from "@electric-sql/pglite";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { executeRows, inScope, type Db, type Scope } from "@/server/adapters/drizzle/client";
import * as schema from "@/server/adapters/drizzle/schema";
import { createMigratedDb, loadOracles } from "../../db/pglite";

export const OWNER = "00000000-0000-4000-8000-00000000000a";
export const STRANGER = "00000000-0000-4000-8000-00000000000b";

export const asOwner: Scope = { role: "authenticated", claims: { sub: OWNER } };
export const asStranger: Scope = { role: "authenticated", claims: { sub: STRANGER } };
export const asService: Scope = { role: "service_role" };

/** A text[] / uuid[] parameter: Drizzle's sql`` spreads a JS array into separate parameters. */
const textArray = (values: string[]) => sql`array(select jsonb_array_elements_text(${JSON.stringify(values)}::jsonb))`;

export interface LedgerDb {
  pg: PGlite;
  db: Db;
  /** Raw SQL rows, run as `scope`. */
  rows<T>(scope: Scope, query: SQL): Promise<T[]>;
  /** Onboards a tenant through create_tenant, as the owner. */
  createTenant(t: {
    name: string;
    rent: number;
    leaseStart: string;
    units: string[];
    kind?: "individual" | "business" | "government";
    /** false: a government tenant whose rent is paid to the owner directly (0016). Default true. */
    rentTracked?: boolean;
  }): Promise<string>;
  /** Bills every given tenant up to `through` (ensure_rent_periods). */
  bill(tenantIds: string[], through: string): Promise<void>;
  /** The tenant's months, oldest first. */
  months(tenantId: string): Promise<{ id: string; period_month: string }[]>;
  /** Records a payment through create_payment, as the owner. */
  pay(tenantId: string, allocations: { rent_period_id: string; amount: number }[], date?: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * A migrated PGlite with an owner, a stranger, one site and tower and its
 * houses. `oracles`: also load the SQL functions 0029 dropped
 * (0029's rollback script), for a parity test to compare with; every other
 * test runs on the schema as migrated.
 */
export async function createLedgerDb(opts: { oracles?: boolean } = {}): Promise<LedgerDb> {
  const pg = await createMigratedDb();
  if (opts.oracles) await loadOracles(pg);
  await pg.exec(`
    insert into auth.users (id, email) values ('${OWNER}', 'a@example.com'), ('${STRANGER}', 'b@example.com');
    insert into app_owner (user_id) values ('${OWNER}');
    insert into locations (location_code, name) values ('AC', 'Arnapal Chakk Complex');
    insert into properties (property_code, location_code, name) values ('AC-T1', 'AC', 'Tower 1');
    insert into units (unit_code, property_code, floor, unit_type)
      select 'AC-T1-G0' || n, 'AC-T1', 'G', 'commercial' from generate_series(1, 6) as n;
  `);
  const db = drizzle(pg, { schema }) as unknown as Db;
  const rows = <T>(scope: Scope, query: SQL) => inScope(db, scope, (tx) => executeRows<T>(tx, query));

  return {
    pg,
    db,
    rows,
    async createTenant(t) {
      const kind = t.kind ?? "individual";
      const phone = kind === "government" ? null : "+919876543210";
      const [row] = await rows<{ id: string }>(
        asOwner,
        sql`select create_tenant(${t.name}, null, ${phone}, 'both', ${t.rent}, ${t.leaseStart}::date,
              ${textArray(t.units)}, null, null, ${kind}, ${t.rentTracked ?? true}) as id`
      );
      return row.id;
    },
    async bill(tenantIds, through) {
      await rows(asService, sql`select ensure_rent_periods(${textArray(tenantIds)}::uuid[], ${through}::date)`);
    },
    async months(tenantId) {
      return rows(
        asOwner,
        sql`select id, to_char(period_month, 'YYYY-MM-DD') as period_month from rent_periods
            where tenant_id = ${tenantId} order by period_month`
      );
    },
    async pay(tenantId, allocations, date = "2026-03-05") {
      const amount = allocations.reduce((sum, a) => sum + a.amount, 0);
      await rows(
        asOwner,
        sql`select create_payment(gen_random_uuid(), ${tenantId}::uuid, ${amount}, ${date}::date, 'cash', null,
              'sig.png', md5(random()::text), now() + interval '14 days', ${JSON.stringify(allocations)}::jsonb)`
      );
    },
    close: () => pg.close(),
  };
}

/**
 * A paged query's `sums` (A26), the long way: fetches every matching row on
 * one page and adds up `keys`. The filters in these tests match at most 100 rows.
 */
export async function expectedSums<R extends object, K extends keyof R & string>(
  allRows: () => Promise<{ rows: R[]; total: number }>,
  keys: readonly K[]
): Promise<Record<K, number>> {
  const { rows, total } = await allRows();
  if (rows.length !== total) throw new Error(`expectedSums: ${total} rows match but only ${rows.length} fit one page`);
  return Object.fromEntries(
    keys.map((k) => [k, rows.reduce((sum, r) => Math.round((sum + Number(r[k])) * 100) / 100, 0)])
  ) as Record<K, number>;
}
