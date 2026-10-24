// Every API endpoint path, in one place. The tree mirrors the page tree:
// the page at src/app/dashboard/tenants/[tenantId]/page.tsx reads from
// src/app/api/dashboard/tenants/[tenantId]/route.ts, and so on.
import { PUBLIC_API_BASE_URL } from "@/lib/publicEnv";

const e = encodeURIComponent;

export const apiPaths = {
  auth: {
    session: "/api/auth/session",
    magicLink: "/api/auth/magic-link",
    password: "/api/auth/password",
    signOut: "/api/auth/signout",
    callback: "/api/auth/callback",
  },
  dashboard: {
    summary: "/api/dashboard",
    defaulters: "/api/dashboard/defaulters",
    search: "/api/dashboard/search",
    profile: "/api/dashboard/profile",
    profilePassword: "/api/dashboard/profile/password",
    properties: {
      list: "/api/dashboard/properties",
      new: "/api/dashboard/properties/new",
      detail: (propertyCode: string) => `/api/dashboard/properties/${e(propertyCode)}`,
      newTenant: (propertyCode: string) => `/api/dashboard/properties/${e(propertyCode)}/tenants/new`,
      bulkTenants: (propertyCode: string) => `/api/dashboard/properties/${e(propertyCode)}/tenants/bulk`,
      units: (propertyCode: string) => `/api/dashboard/properties/${e(propertyCode)}/units`,
      newUnit: (propertyCode: string) => `/api/dashboard/properties/${e(propertyCode)}/units/new`,
    },
    houses: {
      list: "/api/dashboard/houses",
      new: "/api/dashboard/houses/new",
    },
    tenants: {
      list: "/api/dashboard/tenants",
      new: "/api/dashboard/tenants/new",
      detail: (tenantId: string) => `/api/dashboard/tenants/${e(tenantId)}`,
      edit: (tenantId: string) => `/api/dashboard/tenants/${e(tenantId)}/edit`,
      moveOut: (tenantId: string) => `/api/dashboard/tenants/${e(tenantId)}/move-out`,
      paidThrough: (tenantId: string) => `/api/dashboard/tenants/${e(tenantId)}/paid-through`,
      payments: (tenantId: string) => `/api/dashboard/tenants/${e(tenantId)}/payments`,
      newPayment: (tenantId: string) => `/api/dashboard/tenants/${e(tenantId)}/payments/new`,
      documents: (tenantId: string) => `/api/dashboard/tenants/${e(tenantId)}/documents`,
      document: (tenantId: string, documentId: string) =>
        `/api/dashboard/tenants/${e(tenantId)}/documents/${e(documentId)}`,
    },
    payments: {
      adjust: (paymentId: string) => `/api/dashboard/payments/${e(paymentId)}/adjust`,
      adjustments: (paymentId: string) => `/api/dashboard/payments/${e(paymentId)}/adjustments`,
      resend: (paymentId: string) => `/api/dashboard/payments/${e(paymentId)}/resend`,
      receipt: (paymentId: string) => `/api/dashboard/payments/${e(paymentId)}/receipt`,
      proof: (paymentId: string, proofId: string) => `/api/dashboard/payments/${e(paymentId)}/proofs/${e(proofId)}`,
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

// PUBLIC_API_BASE_URL empty = same origin. Point it at a standalone backend
// to move the API out of this Next.js app without touching any page or component.
/** Absolute-or-relative URL for a browser link to the API (e.g. a receipt download). */
export function apiHref(path: string): string {
  return `${PUBLIC_API_BASE_URL}${path}`;
}
