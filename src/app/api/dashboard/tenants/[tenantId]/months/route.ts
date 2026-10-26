import { ownerRoute, readQuery } from "@/server/http";
import { getTenantMonths } from "@/server/services/tenants";

type Params = { tenantId: string };

// The "Months" table on /tenants/[tenantId]: one page, sorted, searched and filtered in SQL (A15)
export const GET = ownerRoute<Params>((ctx, request, { tenantId }) => getTenantMonths(ctx, tenantId, readQuery(request)));
