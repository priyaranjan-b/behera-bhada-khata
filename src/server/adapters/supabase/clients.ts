import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types";
import { ApiError } from "@/lib/errors";

export type Supabase = SupabaseClient<Database>;

/**
 * Acts as the signed-in owner (session from the request cookies), so Row
 * Level Security scopes every query to their own rows.
 */
export async function createSessionClient(): Promise<Supabase> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
    }
  );
}

/**
 * Service role - bypasses Row Level Security. Only for code that authorizes
 * the caller itself (the confirm-token flow, rent-period upkeep, cron).
 */
export function createAdminClient(): Supabase {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
}

// Supabase responses are a union of { data, error: null } and { data: null, error }.
type Result<T> = { data: T; error: null } | { data: null; error: { message: string } };

/** Throws on a read error so callers only deal with data (surfaces as a 500). */
export function must<T>(result: Result<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

/** Throws on a rejected write - a constraint or policy violation is the caller's input problem (400). */
export function mustWrite<T>(result: Result<T>): NonNullable<T> {
  if (result.error) throw new ApiError(400, result.error.message);
  return result.data as NonNullable<T>;
}
