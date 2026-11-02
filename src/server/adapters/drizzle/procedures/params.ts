import "server-only";
import { sql, type SQL } from "drizzle-orm";

// Parameters for the SQL functions that stay in Postgres (procedures/).
// Drizzle's sql`` spreads a JS array into separate parameters, so arrays
// and objects go in as one JSON parameter and are unpacked in SQL.

/** A text[] argument (null stays null). */
export function textArray(values: readonly string[] | null): SQL {
  return values === null ? sql`null::text[]` : sql`array(select jsonb_array_elements_text(${JSON.stringify(values)}::jsonb))`;
}

/** A uuid[] argument (null stays null). */
export function uuidArray(values: readonly string[] | null): SQL {
  return values === null ? sql`null::uuid[]` : sql`${textArray(values)}::uuid[]`;
}

/** A jsonb argument. */
export function jsonb(value: unknown): SQL {
  return sql`${JSON.stringify(value)}::jsonb`;
}
