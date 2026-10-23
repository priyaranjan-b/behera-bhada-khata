import "server-only";
// The one place that picks implementations for the ports in ../ports.ts.
// Swap these bindings (e.g. to a MySQL adapter) to change the backing
// services; nothing else in the app imports an adapter directly.
import type { AuthGateway, FileStorage, OwnerRepositories, SystemRepositories } from "@/server/ports";
import { supabaseOwnerRepositories, supabaseSystemRepositories } from "@/server/adapters/supabase/db";
import { supabaseAuth } from "@/server/adapters/supabase/auth";
import { supabaseStorage } from "@/server/adapters/supabase/storage";

/** Data access as the given owner. */
export function ownerDb(ownerId: string): Promise<OwnerRepositories> {
  return supabaseOwnerRepositories(ownerId);
}

/** Data access with no owner scope - see SystemRepositories for who may use it. */
export function systemDb(): SystemRepositories {
  return supabaseSystemRepositories();
}

export const auth: AuthGateway = supabaseAuth;

export const storage: FileStorage = supabaseStorage;
