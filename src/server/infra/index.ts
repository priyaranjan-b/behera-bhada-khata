import "server-only";
// The one place that picks implementations for the ports in ../ports.ts.
// Swap these bindings (e.g. to a MySQL adapter) to change the backing
// services; nothing else in the app imports an adapter directly.
import type { AuthGateway, FileStorage, Messaging, OwnerRepositories, SystemRepositories } from "@/server/ports";
import { supabaseOwnerRepositories, supabaseSystemRepositories } from "@/server/adapters/supabase/db";
import { supabaseAuth } from "@/server/adapters/supabase/auth";
import { supabaseStorage } from "@/server/adapters/supabase/storage";
import { twilioMessaging } from "@/server/adapters/twilio/messaging";

/** Data access as the signed-in owner (the database refuses anyone else). */
export function ownerDb(): Promise<OwnerRepositories> {
  return supabaseOwnerRepositories();
}

/** Data access with no owner scope - see SystemRepositories for who may use it. */
export function systemDb(): SystemRepositories {
  return supabaseSystemRepositories();
}

export const auth: AuthGateway = supabaseAuth;

export const storage: FileStorage = supabaseStorage;

export const messaging: Messaging = twilioMessaging;
