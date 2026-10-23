import { ApiError } from "@/lib/errors";
import { apiPaths as p } from "./paths";
import type { Api } from "./types";

export interface HttpApiOptions {
  /** "" for same-origin, or an absolute origin such as https://api.example.com. */
  baseUrl: string;
  /** Extra headers per request - the server uses this to forward the session cookie. */
  headers?: () => Promise<HeadersInit> | HeadersInit;
}

/** The API over fetch. Same shape as the in-process server API, so callers can't tell them apart. */
export function createHttpApi({ baseUrl, headers }: HttpApiOptions): Api {
  async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(headers ? await headers() : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
      cache: "no-store",
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const message = data && typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
      throw new ApiError(res.status, message);
    }
    return data as T;
  }

  const get = <T>(path: string) => request<T>("GET", path);
  const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {});

  return {
    auth: {
      session: () => get(p.auth.session),
      requestMagicLink: (input) => post(p.auth.magicLink, input),
      setSession: (tokens) => post(p.auth.session, tokens),
      signOut: () => post(p.auth.signOut),
    },
    dashboard: {
      summary: (month) => get(month ? `${p.dashboard.summary}?month=${encodeURIComponent(month)}` : p.dashboard.summary),
      properties: {
        list: () => get(p.dashboard.properties.list),
        detail: (id) => get(p.dashboard.properties.detail(id)),
        newTenant: (id) => get(p.dashboard.properties.newTenant(id)),
        bulkTenants: (id) => get(p.dashboard.properties.bulkTenants(id)),
        create: (input) => post(p.dashboard.properties.list, input),
        createTenant: (id, input) => post(p.dashboard.properties.tenants(id), input),
        bulkCreateTenants: (id, tenants) => post(p.dashboard.properties.bulkTenants(id), { tenants }),
      },
      tenants: {
        list: () => get(p.dashboard.tenants.list),
        detail: (id) => get(p.dashboard.tenants.detail(id)),
        newPayment: (id) => get(p.dashboard.tenants.newPayment(id)),
        createPayment: (id, input) => post(p.dashboard.tenants.payments(id), input),
      },
      payments: {
        adjust: (id) => get(p.dashboard.payments.adjust(id)),
        createAdjustment: (id, input) => post(p.dashboard.payments.adjustments(id), input),
        resend: (id, input) => post(p.dashboard.payments.resend(id), input),
      },
      adjustments: {
        resend: (id, input) => post(p.dashboard.adjustments.resend(id), input),
      },
    },
    confirm: {
      detail: (token) => get(p.confirm.detail(token)),
      sendOtp: (token, recordType) => post(p.confirm.otp(token), { recordType }),
      submit: (token, input) => post(p.confirm.detail(token), input),
    },
  };
}
