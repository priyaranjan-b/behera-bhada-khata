import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const isDev = process.env.NODE_ENV !== "production";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; next?: string } | null;
  const email = body?.email?.trim();
  const next = body?.next || "/dashboard";
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const origin = process.env.NEXT_PUBLIC_APP_URL;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  if (isDev) {
    // No email provider configured locally - generate the link with the
    // admin API and hand it back in the response instead of sending it.
    // Never do this in production (this whole branch is skipped when
    // NODE_ENV=production).
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (error) return NextResponse.json({ error: "Could not create a sign-in link" }, { status: 500 });

    console.log(`\n[dev] Sign-in link for ${email}:\n${data.properties.action_link}\n`);
    return NextResponse.json({ dev: true, link: data.properties.action_link });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) return NextResponse.json({ error: "Could not send the link" }, { status: 500 });

  return NextResponse.json({ dev: false });
}
