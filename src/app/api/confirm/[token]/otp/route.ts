import { NextResponse } from "next/server";
import { otpSendSchema } from "@/lib/validation";
import { loadPendingRecordByToken, maskPhone } from "@/lib/ledger";
import { sendOtp } from "@/lib/messaging/twilio";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const parsed = otpSendSchema.safeParse({ token, ...body });
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const context = await loadPendingRecordByToken(token, parsed.data.recordType);
  if (!context) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (context.record.status !== "pending") {
    return NextResponse.json({ error: "Already confirmed" }, { status: 409 });
  }
  if (new Date(context.record.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  try {
    await sendOtp(context.tenant.phone);
  } catch {
    return NextResponse.json({ error: "Could not send the verification code" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, maskedPhone: maskPhone(context.tenant.phone) });
}
