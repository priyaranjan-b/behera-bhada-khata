import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuthedClient, readJsonBody } from "@/lib/api";
import { createAdjustmentSchema } from "@/lib/validation";
import { generateConfirmToken } from "@/lib/token";
import { dataUrlToBytes, uploadPrivateFile } from "@/lib/storage";
import { sendConfirmLink } from "@/lib/messaging/twilio";
import { formatMoney } from "@/lib/money";

export async function POST(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const { supabase, unauthorized } = await requireAuthedClient();
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(request);
  const parsed = createAdjustmentSchema.safeParse({
    originalPaymentId: paymentId,
    ...(typeof body === "object" ? body : {}),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, tenant_id, status")
    .eq("id", paymentId)
    .single();
  if (!payment || payment.status !== "confirmed") {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, phone, preferred_channel, name, property_id")
    .eq("id", payment.tenant_id)
    .single();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  const adjustmentId = randomUUID();
  const ownerSignaturePath = `adjustments/${tenant.property_id}/${tenant.id}/${adjustmentId}/owner-signature.png`;

  try {
    await uploadPrivateFile(ownerSignaturePath, dataUrlToBytes(parsed.data.ownerSignaturePng), "image/png");
  } catch {
    return NextResponse.json({ error: "Could not save signature" }, { status: 500 });
  }

  const { token, tokenHash, expiresAt } = generateConfirmToken();

  const { error: insertError } = await supabase.from("adjustments").insert({
    id: adjustmentId,
    tenant_id: tenant.id,
    original_payment_id: paymentId,
    delta_amount: parsed.data.deltaAmount,
    reason: parsed.data.reason,
    owner_signature_path: ownerSignaturePath,
    token_hash: tokenHash,
    token_expires_at: expiresAt,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  const { error: allocError } = await supabase.from("adjustment_allocations").insert(
    parsed.data.allocations.map((a) => ({
      adjustment_id: adjustmentId,
      rent_period_id: a.rentPeriodId,
      amount_delta: a.amountDelta,
    }))
  );
  if (allocError) return NextResponse.json({ error: allocError.message }, { status: 400 });

  const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL}/confirm/${token}`;
  const message = `Hi ${tenant.name}, a correction of ${formatMoney(
    parsed.data.deltaAmount
  )} was recorded on a past payment. Please confirm: ${confirmUrl}`;
  await sendConfirmLink({ toPhoneE164: tenant.phone, channel: tenant.preferred_channel, message });

  return NextResponse.json({ id: adjustmentId, tenantId: tenant.id });
}
