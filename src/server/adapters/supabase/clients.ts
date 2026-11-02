import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types";
import { env } from "@/server/env";

export type Supabase = SupabaseClient<Database>;

/**
 * Acts as the signed-in owner (session from the request cookies), so Row
 * Level Security scopes every query to their own rows.
 */
export async function createSessionClient(): Promise<Supabase> {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = env();

  return createServerClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render - the proxy already
          // refreshed the session cookie for this request.
        }
      },
    },
  });
}

/**
 * Service role - bypasses Row Level Security. Only for code that authorizes
 * the caller itself: the owner lookup at sign-in and file storage.
 */
export function createAdminClient(): Supabase {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = env();
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}
