import "server-only";
import { cache } from "react";
// The one place that picks implementations for the ports in ../ports.ts.
// Swap these bindings (e.g. to a MySQL adapter) to change the backing
// services; nothing else in the app imports an adapter directly.
import type { AuthGateway, FileStorage, Messaging, OwnerRepositories, SystemRepositories } from "@/server/ports";
import { supabaseOwnerRepositories, supabaseSystemRepositories } from "@/server/adapters/supabase/db";
import { sessionJwtClaims, supabaseAuth } from "@/server/adapters/supabase/auth";
import { supabaseStorage } from "@/server/adapters/supabase/storage";
import { twilioMessaging } from "@/server/adapters/twilio/messaging";
import { drizzleDb, drizzleOwnerRepositories, drizzleSystemRepositories } from "@/server/adapters/drizzle";
import { env } from "@/server/env";

// DATA_ADAPTER picks one data adapter for the whole app (A19): drizzle, or
// supabase - the rollback, until src/server/adapters/supabase/db.ts is deleted.
const drizzleBound = () => env().DATA_ADAPTER === "drizzle";

/** Once per request: a page makes several ownerDb() calls, each would verify the JWT again. */
const requestClaims = cache(sessionJwtClaims);

/** Data access as the signed-in owner (the database refuses anyone else). */
export async function ownerDb(): Promise<OwnerRepositories> {
  if (!drizzleBound()) return supabaseOwnerRepositories();
  const claims = await requestClaims();
  // Signed out: the Supabase session client sees nothing (RLS), so it is the safe answer.
  return claims ? drizzleOwnerRepositories(drizzleDb(), claims) : supabaseOwnerRepositories();
}

/** Data access with no owner scope - see SystemRepositories for who may use it. */
export function systemDb(): SystemRepositories {
  return drizzleBound() ? drizzleSystemRepositories(drizzleDb()) : supabaseSystemRepositories();
}

export const auth: AuthGateway = supabaseAuth;

export const storage: FileStorage = supabaseStorage;

export const messaging: Messaging = twilioMessaging;
