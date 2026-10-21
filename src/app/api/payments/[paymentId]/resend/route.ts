import { NextResponse } from "next/server";
import { requireAuthedClient, readJsonBody } from "@/lib/api";
import { resendConfirmLink } from "@/lib/resend";

export async function POST(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const { supabase, unauthorized } = await requireAuthedClient();
  if (unauthorized) return unauthorized;

  const body = (await readJsonBody(request)) as { tenantId?: string; amount?: number } | null;
  if (!body?.tenantId || typeof body.amount !== "number") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await resendConfirmLink({
    supabase,
    table: "payments",
    recordId: paymentId,
    tenantId: body.tenantId,
    amount: body.amount,
    label: "rent payment",
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
