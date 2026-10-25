import { ApiError } from "@/lib/errors";
import { withQuery } from "@/lib/routes";
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
  async function request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
    // FormData sets its own multipart Content-Type (with the boundary).
    const isForm = body instanceof FormData;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined || isForm ? {} : { "Content-Type": "application/json" }),
        ...(headers ? await headers() : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
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
  const put = <T>(path: string, body: unknown) => request<T>("PUT", path, body);
  /** JSON as-is, or with files: a multipart form of `payload` (the JSON) + each file under `fileField`. */
  const postWithFiles = <T>(path: string, body: unknown, fileField: string, files: Blob[] = []) => {
    if (files.length === 0) return post<T>(path, body);
    const form = new FormData();
    form.append("payload", JSON.stringify(body));
    for (const f of files) form.append(fileField, f);
    return request<T>("POST", path, form);
  };

  return {
    auth: {
      session: () => get(p.auth.session),
      loginOptions: () => get(p.auth.magicLink),
      requestMagicLink: (input) => post(p.auth.magicLink, input),
      signInWithPassword: (input) => post(p.auth.password, input),
      setSession: (tokens) => post(p.auth.session, tokens),
      signOut: () => post(p.auth.signOut),
    },
    dashboard: {
      overview: {
        month: (month, options = {}) => get(withQuery(p.dashboard.overview.month, { month, paidDirect: options.paidDirect })),
        trend: (options = {}) => get(withQuery(p.dashboard.overview.trend, { paidDirect: options.paidDirect })),
        houses: () => get(p.dashboard.overview.houses),
        attention: () => get(p.dashboard.overview.attention),
        portfolio: (options = {}) => get(withQuery(p.dashboard.overview.portfolio, { paidDirect: options.paidDirect })),
      },
      paidDirect: (options = {}) => get(withQuery(p.dashboard.paidDirect, { paidDirect: options.paidDirect })),
      defaulters: () => get(p.dashboard.defaulters),
      billing: (query = {}) => get(withQuery(p.dashboard.billing, { ...query })),
      activity: (query = {}) => get(withQuery(p.dashboard.activity, { ...query })),
      search: () => get(p.dashboard.search),
      profile: () => get(p.dashboard.profile),
      updateProfile: (input) => put(p.dashboard.profile, input),
      changePassword: (input) => post(p.dashboard.profilePassword, input),
      properties: {
        list: () => get(p.dashboard.properties.list),
        newForm: () => get(p.dashboard.properties.new),
        detail: (code) => get(p.dashboard.properties.detail(code)),
        newTenant: (code) => get(p.dashboard.properties.newTenant(code)),
        bulkTenants: (code) => get(p.dashboard.properties.bulkTenants(code)),
        newUnit: (code) => get(p.dashboard.properties.newUnit(code)),
        create: (input) => post(p.dashboard.properties.list, input),
        createUnit: (code, input) => post(p.dashboard.properties.units(code), input),
        bulkCreateTenants: (id, tenants) => post(p.dashboard.properties.bulkTenants(id), { tenants }),
      },
      houses: {
        list: () => get(p.dashboard.houses.list),
        newForm: () => get(p.dashboard.houses.new),
        history: (code, before) => get(withQuery(p.dashboard.houses.history(code), { before })),
      },
      tenants: {
        list: () => get(p.dashboard.tenants.list),
        newForm: () => get(p.dashboard.tenants.new),
        create: (input) => post(p.dashboard.tenants.list, input),
        detail: (id) => get(p.dashboard.tenants.detail(id)),
        edit: (id) => get(p.dashboard.tenants.edit(id)),
        history: (id, before) => get(withQuery(p.dashboard.tenants.history(id), { before })),
        update: (id, input) => put(p.dashboard.tenants.detail(id), input),
        moveOut: (id, input) => post(p.dashboard.tenants.moveOut(id), input),
        correctPaidThrough: (id, input) => post(p.dashboard.tenants.paidThrough(id), input),
        startRentTracking: (id, input) => post(p.dashboard.tenants.rentTracking(id), input),
        stopRentTracking: async (id) => {
          await request("DELETE", p.dashboard.tenants.rentTracking(id));
        },
        newPayment: (id) => get(p.dashboard.tenants.newPayment(id)),
        createPayment: (id, input, proofs) => postWithFiles(p.dashboard.tenants.payments(id), input, "proofs", proofs),
        uploadDocuments: (id, input, files) => postWithFiles(p.dashboard.tenants.documents(id), input, "files", files),
        deleteDocument: async (id, documentId) => {
          await request("DELETE", p.dashboard.tenants.document(id, documentId));
        },
      },
      payments: {
        adjust: (id) => get(p.dashboard.payments.adjust(id)),
        createAdjustment: (id, input) => post(p.dashboard.payments.adjustments(id), input),
        resend: (id) => post(p.dashboard.payments.resend(id)),
      },
      adjustments: {
        resend: (id) => post(p.dashboard.adjustments.resend(id)),
      },
    },
    confirm: {
      detail: (token) => get(p.confirm.detail(token)),
      sendOtp: (token, recordType) => post(p.confirm.otp(token), { recordType }),
      submit: (token, input) => post(p.confirm.detail(token), input),
    },
  };
}
