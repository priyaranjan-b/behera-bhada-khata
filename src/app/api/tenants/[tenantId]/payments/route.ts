import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuthedClient, readJsonBody } from "@/lib/api";
import { createPaymentSchema } from "@/lib/validation";
import { generateConfirmToken } from "@/lib/token";
import { dataUrlToBytes, uploadPrivateFile } from "@/lib/storage";
import { sendConfirmLink } from "@/lib/messaging/twilio";
import { formatMoney } from "@/lib/money";

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { supabase, unauthorized } = await requireAuthedClient();
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(request);
  const parsed = createPaymentSchema.safeParse({ tenantId, ...(typeof body === "object" ? body : {}) });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, phone, preferred_channel, name, property_id")
    .eq("id", tenantId)
    .single();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const paymentId = randomUUID();
  const ownerSignaturePath = `payments/${tenant.property_id}/${tenant.id}/${paymentId}/owner-signature.png`;

  try {
    await uploadPrivateFile(ownerSignaturePath, dataUrlToBytes(parsed.data.ownerSignaturePng), "image/png");
  } catch {
    return NextResponse.json({ error: "Could not save signature" }, { status: 500 });
  }

  const { token, tokenHash, expiresAt } = generateConfirmToken();

  const { error: insertError } = await supabase.from("payments").insert({
    id: paymentId,
    tenant_id: tenantId,
    amount: parsed.data.amount,
    payment_date: parsed.data.paymentDate,
    mode: parsed.data.mode,
    note: parsed.data.note ?? null,
    owner_signature_path: ownerSignaturePath,
    token_hash: tokenHash,
    token_expires_at: expiresAt,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  const { error: allocError } = await supabase.from("payment_allocations").insert(
    parsed.data.allocations.map((a) => ({
      payment_id: paymentId,
      rent_period_id: a.rentPeriodId,
      amount_allocated: a.amountAllocated,
    }))
  );
  if (allocError) return NextResponse.json({ error: allocError.message }, { status: 400 });

  const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL}/confirm/${token}`;
  const message = `Hi ${tenant.name}, a rent payment of ${formatMoney(
    parsed.data.amount
  )} was recorded. Please confirm here: ${confirmUrl}`;
  await sendConfirmLink({ toPhoneE164: tenant.phone, channel: tenant.preferred_channel, message });

  return NextResponse.json({ id: paymentId });
}
