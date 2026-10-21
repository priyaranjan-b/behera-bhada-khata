import { NextResponse } from "next/server";
import { requireAuthedClient, readJsonBody } from "@/lib/api";
import { createTenantSchema } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const { supabase, unauthorized } = await requireAuthedClient();
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(request);
  const parsed = createTenantSchema.safeParse({ propertyId, ...(typeof body === "object" ? body : {}) });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tenants")
    .insert({
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
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
