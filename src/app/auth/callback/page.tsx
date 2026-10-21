import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HashSessionHandler from "./HashSessionHandler";

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  const { code, next } = await searchParams;
  const target = next ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    redirect(error ? "/login?error=1" : target);
  }

  // No `code` - this may be an implicit-flow redirect carrying the session in
  // the URL hash fragment instead (e.g. admin-generated dev sign-in links,
  // which have no PKCE handshake to exchange a code against). The server
  // never sees a fragment, so hand off to the client to read
  // `window.location.hash` and finish sign-in from there.
  return <HashSessionHandler next={target} />;
}
