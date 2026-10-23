import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/server/infra/proxy";

const PROTECTED_PREFIX = "/dashboard";

export async function proxy(request: NextRequest) {
  const { response, isAuthed } = await refreshSession(request);

  if (request.nextUrl.pathname.startsWith(PROTECTED_PREFIX) && !isAuthed) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
