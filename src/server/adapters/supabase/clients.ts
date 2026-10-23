import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types";
import { ApiError } from "@/lib/errors";
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
 * the caller itself (the confirm-token flow, rent-period upkeep, cron).
 */
export function createAdminClient(): Supabase {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = env();
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}

// Supabase responses are a union of { data, error: null } and { data: null, error }.
type DbError = { message: string; code?: string };
type Result<T> = { data: T; error: null } | { data: null; error: DbError };

/** Throws on a read error so callers only deal with data (surfaces as a 500). */
export function must<T>(result: Result<T>, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

// SQLSTATEs raised on purpose by the ledger functions
// (supabase/migrations/0004_ledger_integrity.sql): their messages are
// written for the person using the app.
const APP_ERROR_STATUS: Record<string, number> = { BBK00: 400, BBK04: 404, BBK09: 409 };

/** The ApiError for a rejected write; database internals never reach the client. */
export function writeError(error: DbError, what: string): ApiError {
  const appStatus = error.code ? APP_ERROR_STATUS[error.code] : undefined;
  if (appStatus) return new ApiError(appStatus, error.message);
  console.error(`${what}: [${error.code ?? "?"}] ${error.message}`);
  if (error.code === "23505") return new ApiError(409, "That already exists");
  if (error.code === "23503") return new ApiError(400, "Refers to something that doesn't exist");
  if (error.code === "42501") return new ApiError(403, "Not allowed");
  return new ApiError(400, "Couldn't save that");
}

/** Throws on a rejected write - a constraint or policy violation is the caller's input problem. */
export function mustWrite<T>(result: Result<T>, what: string): NonNullable<T> {
  if (result.error) throw writeError(result.error, what);
  return result.data as NonNullable<T>;
}

/** Splits ids for `.in()` filters so a long list doesn't overflow the request URL. */
export function chunk<T>(items: T[], size = 100): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
