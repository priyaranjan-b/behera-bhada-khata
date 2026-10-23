// Session refresh for src/proxy.ts, kept apart from ./index.ts so the proxy
// bundle doesn't pull in the database and storage adapters.
export { refreshSupabaseSession as refreshSession } from "@/server/adapters/supabase/proxy";
