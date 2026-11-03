// A real Postgres in-process (PGlite) with every migration in
// supabase/migrations applied, plus stand-ins for the bits of Supabase they
// rely on (auth.uid(), the anon/authenticated/service_role roles and their
// default grants, storage.buckets). Shared by test/schema.test.ts and the
// Drizzle adapter tests.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

export const MIGRATIONS = path.resolve(__dirname, "../../supabase/migrations");

export const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase grants everything in public to these roles by default; the
  -- migrations then revoke what they must.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
  );
`;

/**
 * A fresh PGlite with the Supabase stubs and every migration, in order;
 * `through` ("0028") stops after that one, to compare with an earlier state.
 */
export async function createMigratedDb(opts: { through?: string } = {}): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(SUPABASE_STUBS);
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.filter((f) => !opts.through || f.slice(0, 4) <= opts.through)) {
    await db.exec(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  return db;
}

/** 0029's rollback: the 30 functions it dropped, frozen as 0028 left them (D33). */
export const ORACLES = path.resolve(__dirname, "../../supabase/rollback/0029_restore_replaced_functions.sql");

/**
 * Loads the SQL functions 0029 dropped (its rollback script) into a test
 * database, as reference answers for the parity and fixed-value tests.
 */
export async function loadOracles(db: PGlite): Promise<void> {
  await db.exec(readFileSync(ORACLES, "utf8"));
}
