import { NextResponse } from "next/server";
import { requireAuthedClient, readJsonBody } from "@/lib/api";
import { createTenantSchema } from "@/lib/validation";

const MAX_ROWS = 500;

export async function POST(request: Request, { params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const { supabase, unauthorized } = await requireAuthedClient();
  if (unauthorized) return unauthorized;

  const body = (await readJsonBody(request)) as { tenants?: unknown[] } | null;
  const tenants = Array.isArray(body?.tenants) ? body.tenants : [];
  if (tenants.length === 0) return NextResponse.json({ error: "No tenants provided" }, { status: 400 });
  if (tenants.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS})` }, { status: 400 });
  }

  let created = 0;
  const failed: { rowNumber: number; error: string }[] = [];

  // Small-scale by design (a landlord's initial load, not a data pipeline) -
  // a plain loop keeps per-row error attribution simple and is plenty fast
  // at this volume.
  for (let i = 0; i < tenants.length; i++) {
    const raw = tenants[i];
    const candidate: object = typeof raw === "object" && raw !== null ? raw : {};
    const parsed = createTenantSchema.safeParse({ propertyId, ...candidate });
    if (!parsed.success) {
      failed.push({ rowNumber: i + 1, error: parsed.error.issues[0]?.message ?? "Invalid input" });
      continue;
    }

    const { error } = await supabase.from("tenants").insert({
      property_id: parsed.data.propertyId,
      name: parsed.data.name,
      business_name: parsed.data.businessName ?? null,
      unit_type: parsed.data.unitType,
      tower: parsed.data.tower ?? null,
      floor: parsed.data.floor ?? null,
      house_number: parsed.data.houseNumber ?? null,
      phone: parsed.data.phone,
      preferred_channel: parsed.data.preferredChannel,
      monthly_rent_amount: parsed.data.monthlyRentAmount,
      lease_start: parsed.data.leaseStart,
    });

    if (error) {
      failed.push({ rowNumber: i + 1, error: error.message });
    } else {
      created += 1;
    }
  }

  return NextResponse.json({ created, failed });
}
