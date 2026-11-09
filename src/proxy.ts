import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/server/infra/proxy";
import { isProtectedPath, routes } from "@/lib/routes";
import { isTenantAllowedPath, TENANT_COOKIE } from "@/lib/tenantPortal";

export async function proxy(request: NextRequest) {
  const { response, isAuthed } = await refreshSession(request);
  const { pathname, search } = request.nextUrl;

  // A browser holding a tenant portal session and no owner session (A32)
  // stays in the portal: any other page goes to /tenant, any other API call
  // is refused. Only the cookie's presence is checked here; every tenant
  // read checks the session itself, and owner data needs an owner session
  // whatever this lets through.
  const tenantSignedIn = request.cookies.has(TENANT_COOKIE.secure) || request.cookies.has(TENANT_COOKIE.insecure);
  if (tenantSignedIn && !isAuthed && !isTenantAllowedPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.redirect(new URL(routes.tenantPortal.home(), request.url));
  }

  // Every page but the public ones (isProtectedPath) needs the owner signed in.
  if (isProtectedPath(pathname) && !isAuthed) {
    const loginUrl = new URL(routes.login(), request.url);
    // Back to the same page after sign-in, query included (safeNext checks it there).
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Static files, app icons and the installed-app files (manifest, service
  // worker, offline page) never need a session: the browser fetches them on
  // the login page too, and a redirect to /login would break install.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|offline.html|icons/).*)",
  ],
};
