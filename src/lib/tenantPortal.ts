// The tenant portal (A32): what the proxy, the server and the pages share
// about where a tenant session may go. Client-safe: nothing secret here.

/**
 * The tenant session cookie. Over HTTPS it carries the `__Host-` prefix
 * (Secure, Path=/, no Domain: no subdomain can set or read it); plain-HTTP
 * development can't use that prefix, so it gets the bare name.
 */
export const TENANT_COOKIE = { secure: "__Host-bbk_tenant", insecure: "bbk_tenant" } as const;

/** Pages and API paths a browser holding a tenant session (and no owner session) may open. */
const TENANT_ALLOWED_PREFIXES = ["/tenant", "/api/tenant/", "/confirm/", "/api/confirm/", "/login", "/auth/", "/api/auth/"] as const;

/** May a tenant-only browser open `pathname`? Anything else is the owner's (the proxy turns it away). */
export function isTenantAllowedPath(pathname: string): boolean {
  return TENANT_ALLOWED_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
