import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/server/infra/proxy";
import { isProtectedPath, routes } from "@/lib/routes";

export async function proxy(request: NextRequest) {
  const { response, isAuthed } = await refreshSession(request);

  // Every page but the public ones (isProtectedPath) needs the owner signed in.
  if (isProtectedPath(request.nextUrl.pathname) && !isAuthed) {
    const loginUrl = new URL(routes.login(), request.url);
    // Back to the same page after sign-in, query included (safeNext checks it there).
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Static files and app icons never need a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
