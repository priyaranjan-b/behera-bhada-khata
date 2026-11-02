import "server-only";
// The Drizzle data adapter (A19): every port method, bound over the Supabase
// adapter when DATA_ADAPTER=drizzle. Layout:
//   schema/       tables, mirroring supabase/migrations
//   grid/         the server-paged tables' search, filters, sort and page
//   queries/      reads that replace a SQL function (logic moved to TS)
//   procedures/   typed calls to the SQL functions that stay in Postgres
//   tables/       plain reads and writes of tables
//   repositories/ the port objects built from the folders above
export { drizzleDb } from "./client";
export { drizzleOwnerRepositories } from "./repositories/owner";
export { drizzleSystemRepositories } from "./repositories/system";
