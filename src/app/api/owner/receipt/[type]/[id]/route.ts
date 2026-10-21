import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrl } from "@/lib/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await params;
  if (type !== "payment" && type !== "adjustment") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.redirect(new URL("/login", request.url));

  const table = type === "payment" ? "payments" : "adjustments";
  // RLS ("owner reads own payments/adjustments") scopes this to the caller's
  // own records - an owner can never fetch another owner's receipt this way.
  const { data: record } = await supabase.from(table).select("pdf_path").eq("id", id).single();

  if (!record?.pdf_path) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const signedUrl = await getSignedUrl(record.pdf_path, 300);
  return NextResponse.redirect(signedUrl);
}
