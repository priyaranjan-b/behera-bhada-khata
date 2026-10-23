import { NextResponse } from "next/server";
import { exchangeCode, safeNext } from "@/server/services/auth";

// PKCE sign-in: the /auth/callback page forwards ?code= here, because only a
// route handler can set the session cookies on its response.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  try {
    if (!code) throw new Error("missing code");
    await exchangeCode(code);
    return NextResponse.redirect(new URL(next, url.origin));
  } catch {
    return NextResponse.redirect(new URL("/login?error=1", url.origin));
  }
}
