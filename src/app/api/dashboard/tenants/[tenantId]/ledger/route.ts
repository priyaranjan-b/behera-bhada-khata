import { ownerRoute } from "@/server/http";
import { getTenantLedger } from "@/server/services/tenants";

type Params = { tenantId: string };

// Page: /dashboard/tenants/[tenantId] - its payments and adjustments section
export const GET = ownerRoute<Params>((ctx, _request, { tenantId }) => getTenantLedger(ctx, tenantId));
