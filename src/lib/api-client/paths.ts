// Every API endpoint path, in one place. The tree mirrors the page tree:
// the page at src/app/dashboard/tenants/[tenantId]/page.tsx reads from
// src/app/api/dashboard/tenants/[tenantId]/route.ts, and so on.
const e = encodeURIComponent;

export const apiPaths = {
  auth: {
    session: "/api/auth/session",
    magicLink: "/api/auth/magic-link",
    signOut: "/api/auth/signout",
    callback: "/api/auth/callback",
  },
  dashboard: {
    summary: "/api/dashboard",
    properties: {
      list: "/api/dashboard/properties",
      detail: (propertyId: string) => `/api/dashboard/properties/${e(propertyId)}`,
      tenants: (propertyId: string) => `/api/dashboard/properties/${e(propertyId)}/tenants`,
      newTenant: (propertyId: string) => `/api/dashboard/properties/${e(propertyId)}/tenants/new`,
      bulkTenants: (propertyId: string) => `/api/dashboard/properties/${e(propertyId)}/tenants/bulk`,
    },
    tenants: {
      list: "/api/dashboard/tenants",
      detail: (tenantId: string) => `/api/dashboard/tenants/${e(tenantId)}`,
      payments: (tenantId: string) => `/api/dashboard/tenants/${e(tenantId)}/payments`,
      newPayment: (tenantId: string) => `/api/dashboard/tenants/${e(tenantId)}/payments/new`,
    },
    payments: {
      adjust: (paymentId: string) => `/api/dashboard/payments/${e(paymentId)}/adjust`,
      adjustments: (paymentId: string) => `/api/dashboard/payments/${e(paymentId)}/adjustments`,
      resend: (paymentId: string) => `/api/dashboard/payments/${e(paymentId)}/resend`,
      receipt: (paymentId: string) => `/api/dashboard/payments/${e(paymentId)}/receipt`,
    },
    adjustments: {
      resend: (adjustmentId: string) => `/api/dashboard/adjustments/${e(adjustmentId)}/resend`,
      receipt: (adjustmentId: string) => `/api/dashboard/adjustments/${e(adjustmentId)}/receipt`,
    },
  },
  confirm: {
    detail: (token: string) => `/api/confirm/${e(token)}`,
    otp: (token: string) => `/api/confirm/${e(token)}/otp`,
    receipt: (token: string, recordType: "payment" | "adjustment") =>
      `/api/confirm/${e(token)}/receipt?recordType=${recordType}`,
  },
} as const;

// Empty = same origin. Point it at a standalone backend to move the API out
// of this Next.js app without touching any page or component.
const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** Absolute-or-relative URL for a browser link to the API (e.g. a receipt download). */
export function apiHref(path: string): string {
  return `${PUBLIC_API_BASE_URL}${path}`;
}
