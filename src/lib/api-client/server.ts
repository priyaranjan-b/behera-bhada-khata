import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/errors";
import { getSession } from "@/server/services/auth";
import { getConfirmView } from "@/server/services/confirm";
import { getDashboardSummary } from "@/server/services/dashboard";
import { getAdjustPaymentForm, getNewPaymentForm } from "@/server/services/payments";
import { getPropertyDetail, getPropertyHeader, listProperties } from "@/server/services/properties";
import { getTenantDetail, listTenants } from "@/server/services/tenants";
import type { OwnerContext } from "@/server/services/context";
import { createHttpApi } from "./http";
import type { ApiQueries } from "./types";

// The API for Server Components. By default it calls the same services the
// route handlers in src/app/api call, in-process - Next.js advises against a
// Server Component fetching its own route handlers (an extra HTTP round trip,
// and nothing is listening at build time). Set API_BASE_URL to send these
// reads over HTTP to a standalone backend instead; pages don't change.

const owner = cache(async (): Promise<OwnerContext> => {
  const session = await getSession();
  return { ownerId: session.userId, email: session.email };
});

const inProcessApi: ApiQueries = {
  auth: {
    session: () => getSession(),
  },
  dashboard: {
    summary: async (month) => getDashboardSummary(await owner(), month),
    properties: {
      list: async () => listProperties(await owner()),
      detail: async (id) => getPropertyDetail(await owner(), id),
      newTenant: async (id) => getPropertyHeader(await owner(), id),
      bulkTenants: async (id) => getPropertyHeader(await owner(), id),
    },
    tenants: {
      list: async () => listTenants(await owner()),
      detail: async (id) => getTenantDetail(await owner(), id),
      newPayment: async (id) => getNewPaymentForm(await owner(), id),
    },
    payments: {
      adjust: async (id) => getAdjustPaymentForm(await owner(), id),
    },
  },
  confirm: {
    detail: (token) => getConfirmView(token),
  },
};

function httpApi(baseUrl: string): ApiQueries {
  return createHttpApi({
    baseUrl,
    // Forward the browser's session cookie to the backend.
    headers: async () => ({ cookie: (await cookies()).toString() }),
  });
}

// Pages render whatever the API returns; the two failures every page treats
// the same way are handled once here: no session -> /login, missing -> 404.
function withPageErrors<T extends object>(api: T): T {
  return Object.fromEntries(
    Object.entries(api).map(([key, value]) => [
      key,
      typeof value === "function"
        ? async (...args: unknown[]) => {
            try {
              return await value(...args);
            } catch (err) {
              if (err instanceof ApiError && err.status === 401) redirect("/login");
              if (err instanceof ApiError && err.status === 404) notFound();
              throw err;
            }
          }
        : withPageErrors(value as object),
    ])
  ) as T;
}

/** Data access for Server Components (pages, layouts). */
export const serverApi: ApiQueries = withPageErrors(
  process.env.API_BASE_URL ? httpApi(process.env.API_BASE_URL) : inProcessApi
);
