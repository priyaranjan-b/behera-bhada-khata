import { NextResponse } from "next/server";
import { hashToken } from "@/lib/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedUrl } from "@/lib/storage";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const recordType = new URL(request.url).searchParams.get("recordType");
  if (recordType !== "payment" && recordType !== "adjustment") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const table = recordType === "payment" ? "payments" : "adjustments";
  const { data: record } = await admin
    .from(table)
    .select("pdf_path, status")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!record || record.status !== "confirmed" || !record.pdf_path) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const signedUrl = await getSignedUrl(record.pdf_path, 300);
  return NextResponse.redirect(signedUrl);
}
