import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { apiBaseUrl } from "@/server/env";
import { getLoginOptions, getOwnerContext, getSession } from "@/server/services/auth";
import { listActivity, tenantHistory, unitHistory } from "@/server/services/audit";
import { getConfirmView } from "@/server/services/confirm";
import { getBillingReport } from "@/server/services/billing";
import { getDefaultersReport } from "@/server/services/dashboard";
import {
  getAttention,
  getHouseCounts,
  getOverviewMonth,
  getOverviewTrend,
  getPaidDirectState,
  getPortfolio,
} from "@/server/services/overview";
import { getAdjustPaymentForm, getNewPaymentForm } from "@/server/services/payments";
import {
  getNewHouseForm,
  getNewPropertyForm,
  getNewTenantForm,
  getPropertyDetail,
  getPropertyHeader,
  listHouses,
  listProperties,
} from "@/server/services/properties";
import { getOwnerProfile } from "@/server/services/profile";
import { getSearchIndex } from "@/server/services/search";
import { getAnyTowerTenantForm, getEditTenantForm, getTenantDetail, listTenants } from "@/server/services/tenants";
import type { OwnerContext } from "@/server/services/context";
import { createHttpApi } from "./http";
import type { ApiQueries } from "./types";

// The API for Server Components. By default it calls the same services the
// route handlers in src/app/api call, in-process - Next.js advises against a
// Server Component fetching its own route handlers (an extra HTTP round trip,
// and nothing is listening at build time). Set API_BASE_URL to send these
// reads over HTTP to a standalone backend instead; pages don't change.

const owner = cache((): Promise<OwnerContext> => getOwnerContext());

const inProcessApi: ApiQueries = {
  auth: {
    session: () => getSession(),
    loginOptions: async () => getLoginOptions(),
  },
  dashboard: {
    overview: {
      month: async (month, options) => getOverviewMonth(await owner(), month, options),
      trend: async (options) => getOverviewTrend(await owner(), options),
      houses: async () => getHouseCounts(await owner()),
      attention: async () => getAttention(await owner()),
      portfolio: async (options) => getPortfolio(await owner(), options),
      paidDirect: async (options) => getPaidDirectState(await owner(), options),
    },
    defaulters: async () => getDefaultersReport(await owner()),
    billing: async (query) => getBillingReport(await owner(), query),
    activity: async (query) => listActivity(await owner(), query ?? {}),
    search: async () => getSearchIndex(await owner()),
    profile: async () => getOwnerProfile(await owner()),
    properties: {
      list: async () => listProperties(await owner()),
      newForm: async () => getNewPropertyForm(await owner()),
      detail: async (code) => getPropertyDetail(await owner(), code),
      newTenant: async (code) => getNewTenantForm(await owner(), code),
      bulkTenants: async (code) => getNewTenantForm(await owner(), code),
      newUnit: async (code) => getPropertyHeader(await owner(), code),
    },
    houses: {
      list: async () => listHouses(await owner()),
      newForm: async () => getNewHouseForm(await owner()),
      history: async (code, before) => unitHistory(await owner(), code, { before }),
    },
    tenants: {
      list: async () => listTenants(await owner()),
      newForm: async () => getAnyTowerTenantForm(await owner()),
      detail: async (id) => getTenantDetail(await owner(), id),
      edit: async (id) => getEditTenantForm(await owner(), id),
      history: async (id, before) => tenantHistory(await owner(), id, { before }),
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

// Picked on first call rather than at import, so loading a page module
// (e.g. during `next build`) doesn't need the environment.
let selected: ApiQueries | undefined;
function selectApi(): ApiQueries {
  const baseUrl = apiBaseUrl();
  selected ??= baseUrl ? httpApi(baseUrl) : inProcessApi;
  return selected;
}

// Pages render whatever the API returns; the two failures every page treats
// the same way are handled once here: no session -> /login, signed in but not
// the owner -> /login?error=owner, missing -> 404.
function withPageErrors<T extends object>(shape: T, resolve: () => T): T {
  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) => [
      key,
      typeof value === "function"
        ? async (...args: unknown[]) => {
            try {
              const fn = (resolve() as Record<string, (...a: unknown[]) => Promise<unknown>>)[key];
              return await fn(...args);
            } catch (err) {
              if (err instanceof ApiError && err.status === 401) redirect(routes.login());
              if (err instanceof ApiError && err.status === 403) redirect(routes.login({ error: "owner" }));
              if (err instanceof ApiError && err.status === 404) notFound();
              throw err;
            }
          }
        : withPageErrors(value as object, () => (resolve() as Record<string, object>)[key]),
    ])
  ) as T;
}

/** Data access for Server Components (pages, layouts). */
export const serverApi: ApiQueries = withPageErrors(inProcessApi, selectApi);
