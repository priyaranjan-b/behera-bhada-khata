import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Every mutating API route needs an authenticated, RLS-scoped Supabase
// client. Centralized here so each route.ts stays focused on its own logic.
export async function requireAuthedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return {
      supabase: null,
      unauthorized: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  return { supabase, unauthorized: null } as const;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}
