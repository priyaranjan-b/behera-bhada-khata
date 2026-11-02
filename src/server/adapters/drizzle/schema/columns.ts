import "server-only";
import { customType } from "drizzle-orm/pg-core";

// Column types that read back exactly what the Supabase adapter returned
// (PostgREST JSON), so rows keep the shapes in src/lib/types.ts whichever
// adapter is bound.

/** numeric(12,2) as a plain JS number (src/lib/money.ts rounds through round2). */
export const money = customType<{ data: number; driverData: string }>({
  dataType: () => "numeric(12,2)",
  fromDriver: (value) => Number(value),
  toDriver: (value) => String(value),
});

/** `date` as its yyyy-MM-dd key (src/lib/dates.ts), never a JS Date. */
export const dateKey = customType<{ data: string; driverData: string }>({
  dataType: () => "date",
});

/**
 * Turns Postgres' text form of a timestamptz ("2026-03-05 10:00:00.123456+00")
 * into the ISO form PostgREST sends ("2026-03-05T10:00:00.123456+00:00").
 */
export function pgTimestampToIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const iso = value.replace(" ", "T");
  return /[+-]\d{2}$/.test(iso) ? `${iso}:00` : iso;
}

/** timestamptz as an ISO 8601 string. */
export const timestamptz = customType<{ data: string; driverData: string }>({
  dataType: () => "timestamp with time zone",
  fromDriver: pgTimestampToIso,
});
