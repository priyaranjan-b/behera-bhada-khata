import { NextResponse } from "next/server";
import { requireAuthedClient, readJsonBody } from "@/lib/api";
import { createPropertySchema } from "@/lib/validation";

export async function POST(request: Request) {
  const { supabase, unauthorized } = await requireAuthedClient();
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(request);
  const parsed = createPropertySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data, error } = await supabase.from("properties").insert(parsed.data).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ id: data.id });
}
