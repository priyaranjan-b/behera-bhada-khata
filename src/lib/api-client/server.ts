import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/lib/errors";
import { routes } from "@/lib/routes";
import { apiBaseUrl } from "@/server/env";
import { getLoginOptions, getOwnerContext, getSession } from "@/server/services/auth";
import { listActivity, maintenanceHistory, tenantHistory, unitHistory } from "@/server/services/audit";
import { getEarnings } from "@/server/services/earnings";
import { getMaintenanceExpense, getMaintenanceForm, getMaintenancePage } from "@/server/services/maintenance";
import { getConfirmView } from "@/server/services/confirm";
import { getBillingPage, getBillingReceived, getBillingTotals } from "@/server/services/billing";
import { getDefaultersReport } from "@/server/services/dashboard";
import { getPaidDirectState } from "@/server/services/paidDirect";
import {
  getAttention,
  getHouseCounts,
  getOverviewMonth,
  getOverviewTrend,
  getPortfolio,
} from "@/server/services/overview";
import { getAdjustPaymentForm, getNewPaymentForm } from "@/server/services/payments";
import {
  getNewHouseForm,
  getNewPropertyForm,
  getNewTenantForm,
  getPropertyHeader,
  listHouses,
  listProperties,
  listPropertyHouses,
  listPropertyTenants,
} from "@/server/services/properties";
import { listPaymentNotePresets } from "@/server/services/paymentNotes";
import { getPaymentTagSuggestions, listPaymentTags } from "@/server/services/paymentTags";
import { getOwnerProfile } from "@/server/services/profile";
import { getPaymentsPage, getPaymentsPaidDirect } from "@/server/services/paymentsReport";
import { getSearchIndex } from "@/server/services/search";
import {
  getAnyTowerTenantForm,
  getEditTenantForm,
  getTenantAccount,
  getTenantMonths,
  getTenantDetail,
  getTenantLedger,
  listTenants,
} from "@/server/services/tenants";
import type { OwnerContext, TenantContext } from "@/server/services/context";
import { getTenantContext, getTenantPortalSession, listTenancies } from "@/server/services/tenantAuth";
import {
  getMyAccount,
  getMyDocuments,
  getMyLedger,
  getMyMonths,
  getMyProfile,
} from "@/server/services/tenantPortal";
import { createHttpApi } from "./http";
import type { ApiQueries } from "./types";

// The API for Server Components. By default it calls the same services the
// route handlers in src/app/api call, in-process - Next.js advises against a
// Server Component fetching its own route handlers (an extra HTTP round trip,
// and nothing is listening at build time). Set API_BASE_URL to send these
// reads over HTTP to a standalone backend instead; pages don't change.

const owner = cache((): Promise<OwnerContext> => getOwnerContext());
/** The signed-in tenant (A32); never an owner check, so a tenant page can't be read with an owner session either. */
const tenant = (): Promise<TenantContext> => getTenantContext();

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
    },
    paidDirect: async (options) => getPaidDirectState(await owner(), options),
    defaulters: async () => getDefaultersReport(await owner()),
    billing: async (query) => getBillingPage(await owner(), query),
    billingTotals: async (query) => getBillingTotals(await owner(), query),
    billingReceived: async (query) => getBillingReceived(await owner(), query),
    activity: async (query) => listActivity(await owner(), query ?? {}),
    search: async () => getSearchIndex(await owner()),
    profile: async () => getOwnerProfile(await owner()),
    paymentNotes: async () => listPaymentNotePresets(await owner()),
    paymentTags: async () => listPaymentTags(await owner()),
    properties: {
      list: async () => listProperties(await owner()),
      newForm: async () => getNewPropertyForm(await owner()),
      detail: async (code) => getPropertyHeader(await owner(), code),
      units: async (code) => listPropertyHouses(await owner(), code),
      tenants: async (code) => listPropertyTenants(await owner(), code),
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
      account: async (id) => getTenantAccount(await owner(), id),
      months: async (id, query) => getTenantMonths(await owner(), id, query ?? {}),
      ledger: async (id, query) => getTenantLedger(await owner(), id, query ?? {}),
      edit: async (id) => getEditTenantForm(await owner(), id),
      history: async (id, query) => tenantHistory(await owner(), id, query ?? {}),
      newPayment: async (id) => getNewPaymentForm(await owner(), id),
    },
    payments: {
      list: async (query) => getPaymentsPage(await owner(), query),
      paidDirect: async (query) => getPaymentsPaidDirect(await owner(), query),
      adjust: async (id) => getAdjustPaymentForm(await owner(), id),
      tagSuggestions: async () => getPaymentTagSuggestions(await owner()),
    },
    earnings: async (query) => getEarnings(await owner(), query ?? {}),
    maintenance: {
      list: async (query) => getMaintenancePage(await owner(), query),
      newForm: async (query) => getMaintenanceForm(await owner(), query ?? {}),
      detail: async (id) => getMaintenanceExpense(await owner(), id),
      history: async (id, before) => maintenanceHistory(await owner(), id, { before }),
    },
  },
  tenant: {
    session: async () => getTenantPortalSession(await tenant()),
    tenancies: () => listTenancies(),
    profile: async () => getMyProfile(await tenant()),
    account: async () => getMyAccount(await tenant()),
    months: async (query) => getMyMonths(await tenant(), query ?? {}),
    ledger: async (query) => getMyLedger(await tenant(), query ?? {}),
    documents: async () => getMyDocuments(await tenant()),
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

/** Where a page goes without the session it needs (401) or with the wrong one (403). */
interface AuthRedirects {
  unauthorized: string;
  forbidden: string;
}

const OWNER_REDIRECTS: AuthRedirects = { unauthorized: routes.login(), forbidden: routes.login({ error: "owner" }) };
/** The tenant portal (A32): its own sign-in, and the picker while a phone hasn't chosen a tenancy. */
const TENANT_REDIRECTS: AuthRedirects = { unauthorized: routes.tenantPortal.login, forbidden: routes.tenantPortal.select };

// Pages render whatever the API returns; the two failures every page treats
// the same way are handled once here: no session -> /login, signed in but not
// the owner -> /login?error=owner, missing -> 404. The tenant portal's calls
// (`tenant.*`) go to its own sign-in and picker instead.
function withPageErrors<T extends object>(shape: T, resolve: () => T, redirects: AuthRedirects = OWNER_REDIRECTS): T {
  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) => [
      key,
      typeof value === "function"
        ? async (...args: unknown[]) => {
            try {
              const fn = (resolve() as Record<string, (...a: unknown[]) => Promise<unknown>>)[key];
              return await fn(...args);
            } catch (err) {
              if (err instanceof ApiError && err.status === 401) redirect(redirects.unauthorized);
              if (err instanceof ApiError && err.status === 403) redirect(redirects.forbidden);
              if (err instanceof ApiError && err.status === 404) notFound();
              throw err;
            }
          }
        : withPageErrors(
            value as object,
            () => (resolve() as Record<string, object>)[key],
            key === "tenant" ? TENANT_REDIRECTS : redirects
          ),
    ])
  ) as T;
}

/** Data access for Server Components (pages, layouts). */
export const serverApi: ApiQueries = withPageErrors(inProcessApi, selectApi);
