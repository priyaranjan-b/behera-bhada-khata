import { ownerRoute } from "@/server/http";
import { getTenantDetail } from "@/server/services/tenants";

type Params = { tenantId: string };

// Page: /dashboard/tenants/[tenantId]
export const GET = ownerRoute<Params>((ctx, _request, { tenantId }) => getTenantDetail(ctx, tenantId));
