import "server-only";
import { cookies } from "next/headers";
import { TENANT_COOKIE } from "@/lib/tenantPortal";
import { env } from "@/server/env";
import type { TenantSessionCookie } from "@/server/ports";

// The tenant portal's session cookie (A32) through Next's request cookies.
// Only the random token goes in it; the session itself is a database row.

function secure(): boolean {
  return env().NEXT_PUBLIC_APP_URL.startsWith("https://");
}

function name(): string {
  return secure() ? TENANT_COOKIE.secure : TENANT_COOKIE.insecure;
}

export const nextTenantCookie: TenantSessionCookie = {
  async read() {
    return (await cookies()).get(name())?.value ?? null;
  },
  async write(token, expiresAt) {
    (await cookies()).set(name(), token, {
      httpOnly: true,
      secure: secure(),
      // Lax: sent when the tenant follows a link to the app (WhatsApp), never on a cross-site POST.
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  },
  async clear() {
    try {
      (await cookies()).delete({ name: name(), path: "/" });
    } catch {
      // A Server Component render can't change cookies; the stale token is refused anyway.
    }
  },
};
