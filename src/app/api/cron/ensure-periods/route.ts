import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureRentPeriods } from "@/lib/periods";

// Scheduled by vercel.json. Vercel sends `Authorization: Bearer $CRON_SECRET`
// automatically for cron invocations when that env var is set.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: tenants } = await admin.from("tenants").select("id").eq("status", "active");

  for (const tenant of tenants ?? []) {
    await ensureRentPeriods(tenant.id);
  }

  return NextResponse.json({ ok: true, tenantsProcessed: tenants?.length ?? 0 });
}
