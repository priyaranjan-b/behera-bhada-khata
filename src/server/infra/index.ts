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
import {
  drizzleDb,
  drizzleOwnerRepositories,
  drizzleSystemRepositories,
  type RepositoryOverrides,
} from "@/server/adapters/drizzle";
import { env } from "@/server/env";

/**
 * The Supabase repositories with the methods already moved to Drizzle laid
 * over them, one namespace method at a time (A19).
 */
function withOverrides<R extends object>(base: R, overrides: RepositoryOverrides<R>): R {
  const merged = { ...base };
  for (const key of Object.keys(overrides) as (keyof R)[]) {
    merged[key] = { ...base[key], ...overrides[key] } as R[keyof R];
  }
  return merged;
}

const drizzleBound = () => env().DATA_ADAPTER === "drizzle";

/** Once per request: a page makes several ownerDb() calls, each would verify the JWT again. */
const requestClaims = cache(sessionJwtClaims);

/** Data access as the signed-in owner (the database refuses anyone else). */
export async function ownerDb(): Promise<OwnerRepositories> {
  const base = await supabaseOwnerRepositories();
  if (!drizzleBound()) return base;
  // Signed out: the Supabase client already sees nothing, so keep it.
  const claims = await requestClaims();
  return claims ? withOverrides(base, drizzleOwnerRepositories(drizzleDb(), claims)) : base;
}

/** Data access with no owner scope - see SystemRepositories for who may use it. */
export function systemDb(): SystemRepositories {
  const base = supabaseSystemRepositories();
  return drizzleBound() ? withOverrides(base, drizzleSystemRepositories(drizzleDb())) : base;
}

export const auth: AuthGateway = supabaseAuth;

export const storage: FileStorage = supabaseStorage;

export const messaging: Messaging = twilioMessaging;
