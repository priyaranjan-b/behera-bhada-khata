import "server-only";
import { cache } from "react";
// The one place that picks implementations for the ports in ../ports.ts.
// Swap these bindings (e.g. to a MySQL adapter) to change the backing
// services; nothing else in the app imports an adapter directly.
import { ApiError } from "@/lib/errors";
import type { AuthGateway, FileStorage, Messaging, OwnerRepositories, SystemRepositories } from "@/server/ports";
import { sessionJwtClaims, supabaseAuth } from "@/server/adapters/supabase/auth";
import { supabaseStorage } from "@/server/adapters/supabase/storage";
import { twilioMessaging } from "@/server/adapters/twilio/messaging";
import { drizzleDb, drizzleOwnerRepositories, drizzleSystemRepositories } from "@/server/adapters/drizzle";

// Data goes through the Drizzle adapter (A19); Supabase is sign-in and file
// storage only.

/** Once per request: a page makes several ownerDb() calls, each would verify the JWT again. */
const requestClaims = cache(sessionJwtClaims);

/** Data access as the signed-in owner (the database refuses anyone else). */
export async function ownerDb(): Promise<OwnerRepositories> {
  const claims = await requestClaims();
  // Callers already hold an OwnerContext, so this is a session that ended since that check.
  if (!claims) throw new ApiError(401, "Unauthorized");
  return drizzleOwnerRepositories(drizzleDb(), claims);
}

/** Data access with no owner scope - see SystemRepositories for who may use it. */
export function systemDb(): SystemRepositories {
  return drizzleSystemRepositories(drizzleDb());
}

export const auth: AuthGateway = supabaseAuth;

export const storage: FileStorage = supabaseStorage;

export const messaging: Messaging = twilioMessaging;
