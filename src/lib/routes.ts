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
  /** Where sign-in lands and where a bad `next` falls back to. */
  home: "/dashboard",
  /** `month` is `yyyy-MM` (see monthParam in src/lib/dates.ts). */
  dashboard: (query?: { month?: string; show?: string }, hash?: string) => withQuery("/dashboard", query, hash),
  defaulters: "/dashboard/defaulters",
  /** `from`/`to` are `yyyy-MM`; none = this month. */
  billing: (query?: { from?: string; to?: string }) => withQuery("/dashboard/billing", query),
  activity: "/dashboard/activity",
  profile: (flash?: Flash) => withQuery("/dashboard/profile", flash),
  login: (query?: { error?: LoginError; next?: string }) => withQuery("/login", query),
  properties: {
    list: "/dashboard/properties",
    new: "/dashboard/properties/new",
    detail: (code: string) => `/dashboard/properties/${e(code)}`,
    newUnit: (code: string) => `/dashboard/properties/${e(code)}/units/new`,
    newTenant: (code: string) => `/dashboard/properties/${e(code)}/tenants/new`,
    bulkTenants: (code: string) => `/dashboard/properties/${e(code)}/tenants/bulk`,
  },
  houses: {
    list: (query?: { show?: string }) => withQuery("/dashboard/houses", query),
    new: "/dashboard/houses/new",
  },
  tenants: {
    list: (query?: { show?: string }) => withQuery("/dashboard/tenants", query),
    new: "/dashboard/tenants/new",
    detail: (id: string, flash?: Flash) => withQuery(`/dashboard/tenants/${e(id)}`, flash),
    edit: (id: string) => `/dashboard/tenants/${e(id)}/edit`,
    newPayment: (id: string) => `/dashboard/tenants/${e(id)}/payments/new`,
  },
  payments: {
    adjust: (id: string) => `/dashboard/payments/${e(id)}/adjust`,
  },
} as const;
