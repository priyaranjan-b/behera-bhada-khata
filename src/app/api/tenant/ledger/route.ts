import { readQuery, tenantRoute } from "@/server/http";
import { getMyLedger } from "@/server/services/tenantPortal";

// /tenant's Payments tab: one page of the tenant's ledger, paged in SQL (A15, A32)
export const GET = tenantRoute(async (ctx, request) => getMyLedger(ctx, readQuery(request)));
