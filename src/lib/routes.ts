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
  maintenanceSaved: "maintenanceSaved",
  maintenanceVoided: "maintenanceVoided",
  /** A set-off was recorded (A22); the value is its payment id, for "Record as maintenance expense". */
  setOff: "setOff",
  error: "error",
} as const;

export type FlashKey = keyof typeof FLASH;
/** A flash to append to a URL, e.g. `{ saved: "1" }` or `{ paymentCreated: "sent" }`. */
export type Flash = Partial<Record<FlashKey, string>>;

type Query = Record<string, string | number | undefined>;

/** Query param of the open tab on a page with `PageTabs` (A16); the first tab leaves it out. */
export const TAB_PARAM = "tab";

/** The tenant page's tabs (A16), first = the default. */
export const TENANT_TABS = ["details", "ledger", "months", "history"] as const;
export type TenantTab = (typeof TENANT_TABS)[number];

/** The tenant portal's tabs (A32), first = the default; ledger and months match TENANT_TABS so the stat cards open them. */
export const TENANT_PORTAL_TABS = ["details", "ledger", "months", "documents"] as const;
export type TenantPortalTab = (typeof TENANT_PORTAL_TABS)[number];

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
  /** `paidDirect: "show"` keeps "Include Govt paid direct" on (A11); off when left out. */
  dashboard: (query?: { month?: string; paidDirect?: "show" }, hash?: string) => withQuery("/", query, hash),
  defaulters: "/defaulters",
  /** Defaulters showing one aging band (`AGING_BUCKETS` key, e.g. `m2to3`); the page's cards and "Show" use it (A28). */
  defaultersBand: (band: string) => withQuery("/defaulters", { band }),
  /** `from`/`to` are `yyyy-MM`; none = last month. */
  billing: (query?: { from?: string; to?: string; paidDirect?: "show" }) => withQuery("/billing", query),
  activity: "/activity",
  /** Effective earning per month (A23); `from`/`to` are `yyyy-MM`, none = the last 12 months. */
  earnings: (query?: { from?: string; to?: string; paidDirect?: "show" }) => withQuery("/earnings", query),
  profile: (flash?: Flash) => withQuery("/profile", flash),
  /** The rent book's shared lists: payment tags, quick notes (A25). */
  settings: "/settings",
  login: (query?: { error?: LoginError; next?: string }) => withQuery("/login", query),
  /** The tenant portal (A32): a tenant's own account, read-only, behind a phone sign-in. No id: the session says whose. */
  tenantPortal: {
    home: (query?: { [TAB_PARAM]?: TenantPortalTab }) => withQuery("/tenant", query),
    login: "/tenant/login",
    /** One phone, several tenancies: pick which to open. */
    select: "/tenant/select",
  },
  properties: {
    list: "/properties",
    /** The Properties page at one site's towers (its section heading is `site-<code>`). */
    site: (locationCode: string) => withQuery("/properties", undefined, `site-${locationCode}`),
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
    /** `tab` opens that tab, e.g. the ledger after recording a payment. */
    detail: (id: string, query?: Flash & { [TAB_PARAM]?: TenantTab }) => withQuery(`/tenants/${e(id)}`, query),
    edit: (id: string) => `/tenants/${e(id)}/edit`,
    newPayment: (id: string) => `/tenants/${e(id)}/payments/new`,
  },
  payments: {
    /** `from`/`to` are days received, yyyy-MM-dd; none = last month. */
    list: (query?: { from?: string; to?: string }) => withQuery("/payments", query),
    adjust: (id: string) => `/payments/${e(id)}/adjust`,
  },
  maintenance: {
    /** `from`/`to` are days spent, yyyy-MM-dd; none = this month. */
    list: (query?: { from?: string; to?: string }) => withQuery("/maintenance", query),
    /** `fromPayment`: a set-off payment's id, to start from its amount, date, note and tenant (A22). */
    new: (query?: { fromPayment?: string }) => withQuery("/maintenance/new", query),
    detail: (id: string, flash?: Flash) => withQuery(`/maintenance/${e(id)}`, flash),
    edit: (id: string) => `/maintenance/${e(id)}/edit`,
  },
} as const;

/**
 * Pages anyone may open without signing in. Every other page is the owner's
 * and the proxy sends a signed-out visitor to /login (fail closed: a new page
 * is protected unless it is listed here). API routes answer 401 themselves,
 * and the tenant's confirm link carries its own token.
 */
// Static files never reach this check: the matcher in src/proxy.ts skips them
// (it can't import a constant). It also lists the installed-app files
// (manifest, sw.js, offline.html, icons/, A21); keep it in step with
// public/ and the sw.js headers in next.config.ts.
// The tenant portal (/tenant, A32) isn't the owner's: its layout checks the
// tenant session instead, and sends anyone without one to /tenant/login.
const PUBLIC_PREFIXES = ["/login", "/auth/", "/confirm/", "/api/", "/tenant"] as const;

/** Does `pathname` need the owner signed in? */
export function isProtectedPath(pathname: string): boolean {
  return !PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
