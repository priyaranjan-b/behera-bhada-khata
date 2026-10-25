// Every page URL, in one place - the page-side twin of apiPaths
// (src/lib/api-client/paths.ts). Build links and redirects with these, never
// with hand-written strings, so a moved page is a one-line change. Client-safe.

const e = encodeURIComponent;

/**
 * One-time messages the next page shows through `FlashAlert` (key = query
 * param). The writer (a form's redirect) and the reader (the page) both use
 * these names.
 */
export const FLASH = {
  saved: "saved",
  passwordChanged: "passwordChanged",
  movedOut: "movedOut",
  paymentCreated: "paymentCreated",
  notifyFailed: "notifyFailed",
  resent: "resent",
  error: "error",
} as const;

export type FlashKey = keyof typeof FLASH;
/** A flash to append to a URL, e.g. `{ saved: "1" }` or `{ paymentCreated: "sent" }`. */
export type Flash = Partial<Record<FlashKey, string>>;

type Query = Record<string, string | number | undefined>;

/** `path` plus the defined query params (and an optional `#hash`). Also builds API query strings. */
export function withQuery(path: string, query?: Query, hash?: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}

/** `?error=` values the login page understands. */
export type LoginError = "owner" | "link";

export const routes = {
  /** The Overview: where sign-in lands and where a bad `next` falls back to. */
  home: "/",
  /** The Overview for a month; `month` is `yyyy-MM` (see monthKeyFromParam in src/lib/dates.ts). */
  dashboard: (query?: { month?: string; show?: string }, hash?: string) => withQuery("/", query, hash),
  defaulters: "/defaulters",
  /** `from`/`to` are `yyyy-MM`; none = this month. */
  billing: (query?: { from?: string; to?: string }) => withQuery("/billing", query),
  activity: "/activity",
  profile: (flash?: Flash) => withQuery("/profile", flash),
  login: (query?: { error?: LoginError; next?: string }) => withQuery("/login", query),
  properties: {
    list: "/properties",
    new: "/properties/new",
    detail: (code: string) => `/properties/${e(code)}`,
    newUnit: (code: string) => `/properties/${e(code)}/units/new`,
    newTenant: (code: string) => `/properties/${e(code)}/tenants/new`,
    bulkTenants: (code: string) => `/properties/${e(code)}/tenants/bulk`,
  },
  houses: {
    list: (query?: { show?: string }) => withQuery("/houses", query),
    new: "/houses/new",
  },
  tenants: {
    list: (query?: { show?: string }) => withQuery("/tenants", query),
    new: "/tenants/new",
    detail: (id: string, flash?: Flash) => withQuery(`/tenants/${e(id)}`, flash),
    edit: (id: string) => `/tenants/${e(id)}/edit`,
    newPayment: (id: string) => `/tenants/${e(id)}/payments/new`,
  },
  payments: {
    adjust: (id: string) => `/payments/${e(id)}/adjust`,
  },
} as const;

/**
 * Pages anyone may open without signing in. Every other page is the owner's
 * and the proxy sends a signed-out visitor to /login (fail closed: a new page
 * is protected unless it is listed here). API routes answer 401 themselves,
 * and the tenant's confirm link carries its own token.
 */
const PUBLIC_PREFIXES = ["/login", "/auth/", "/confirm/", "/api/"] as const;

/** Does `pathname` need the owner signed in? */
export function isProtectedPath(pathname: string): boolean {
  return !PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
