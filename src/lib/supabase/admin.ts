import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// Bypasses Row Level Security. Only ever import this from server-only code
// (route handlers, server actions) that itself enforces who's allowed to do
// what - e.g. the confirm-token flow, where possession of the unguessable
// token is the authorization check instead of a Supabase Auth session.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}
