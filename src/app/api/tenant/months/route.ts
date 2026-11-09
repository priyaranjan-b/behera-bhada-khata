import { readQuery, tenantRoute } from "@/server/http";
import { getMyMonths } from "@/server/services/tenantPortal";

// /tenant's Months tab: one page of the tenant's rent months, paged in SQL (A15, A32)
export const GET = tenantRoute(async (ctx, request) => getMyMonths(ctx, readQuery(request)));
