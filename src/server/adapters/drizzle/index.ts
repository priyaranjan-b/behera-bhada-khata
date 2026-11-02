import "server-only";
// The Drizzle data adapter (A19). Moved so far: tenants.accountSummary.
// Layout (the folders marked "later" appear with their first file):
//   schema/       tables, mirroring supabase/migrations
//   queries/      reads that replace a SQL function (logic moved to TS)
//   procedures/   later: typed calls to SQL functions that stay in Postgres
//   tables/       later: simple reads/writes of plain tables
//   repositories/ the port objects built from the folders above
export { drizzleDb } from "./client";
export { drizzleOwnerRepositories, type RepositoryOverrides } from "./repositories/owner";
export { drizzleSystemRepositories } from "./repositories/system";
