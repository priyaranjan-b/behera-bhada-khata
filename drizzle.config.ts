// drizzle-kit is used for `pull` (draft a schema from a database to compare
// with src/server/adapters/drizzle/schema) and `check` only. The schema
// changes through hand-written SQL in supabase/migrations (A1, A19): never
// run `drizzle-kit push`, `generate` or `migrate` against this project.
//
// It reads DRIZZLE_KIT_URL, never the app's DATABASE_URL: the app's login
// (app_drizzle) can't see any table, and a schema-reading login must not end
// up where the app would load it.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/adapters/drizzle/schema/index.ts",
  out: "./.drizzle",
  dbCredentials: { url: process.env.DRIZZLE_KIT_URL ?? "" },
  schemaFilter: ["public"],
});
