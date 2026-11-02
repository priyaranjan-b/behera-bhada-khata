// The Drizzle schema (src/server/adapters/drizzle/schema) mirrors the
// migrations, which stay the source of truth (A1, A19): every table and
// view, every column, its type and whether it may be null. A migration that
// changes a column fails here until the mirror catches up.
import type { PGlite } from "@electric-sql/pglite";
import { getTableConfig, getViewConfig, PgTable, PgView, type PgColumn } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/adapters/drizzle/schema";
import { createMigratedDb } from "../../db/pglite";

/** Drizzle's SQL type -> information_schema.columns.udt_name. */
const UDT: Record<string, string> = {
  text: "text",
  uuid: "uuid",
  boolean: "bool",
  integer: "int4",
  bigint: "int8",
  jsonb: "jsonb",
  "numeric(12,2)": "numeric",
  date: "date",
  "timestamp with time zone": "timestamptz",
};

type Shape = Record<string, { type: string; nullable: boolean }>;

function drizzleShapes(): Record<string, Shape> {
  const shapes: Record<string, Shape> = {};
  const add = (name: string, columns: PgColumn[]) => {
    shapes[name] = Object.fromEntries(
      columns.map((c) => [c.name, { type: UDT[c.getSQLType()] ?? `unmapped:${c.getSQLType()}`, nullable: !c.notNull }])
    );
  };
  for (const value of Object.values(schema)) {
    if (value instanceof PgTable) {
      const config = getTableConfig(value);
      add(config.name, config.columns);
    } else if (value instanceof PgView) {
      // Postgres reports every view column as nullable, so only names and types are compared.
      const config = getViewConfig(value);
      add(config.name, Object.values(config.selectedFields) as PgColumn[]);
      for (const column of Object.values(shapes[config.name])) column.nullable = true;
    }
  }
  return shapes;
}

let db: PGlite;

beforeAll(async () => {
  db = await createMigratedDb();
});

afterAll(async () => {
  await db?.close();
});

async function databaseShapes(): Promise<Record<string, Shape>> {
  const { rows } = await db.query<{ table_name: string; column_name: string; udt_name: string; is_nullable: string }>(
    `select table_name, column_name, udt_name, is_nullable from information_schema.columns
     where table_schema = 'public' order by table_name, ordinal_position`
  );
  const shapes: Record<string, Shape> = {};
  for (const r of rows) {
    shapes[r.table_name] ??= {};
    shapes[r.table_name][r.column_name] = { type: r.udt_name, nullable: r.is_nullable === "YES" };
  }
  return shapes;
}

describe("Drizzle schema mirror", () => {
  it("has every table and view the migrations create, and no others", async () => {
    expect(Object.keys(drizzleShapes()).sort()).toEqual(Object.keys(await databaseShapes()).sort());
  });

  it("matches every column's name, type and nullability", async () => {
    const actual = await databaseShapes();
    const mirror = drizzleShapes();
    for (const [table, columns] of Object.entries(actual)) {
      expect({ table, columns: mirror[table] }).toEqual({ table, columns });
    }
  });
});
