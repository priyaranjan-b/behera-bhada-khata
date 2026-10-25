import { ownerRoute } from "@/server/http";
import { getTenantAccount } from "@/server/services/tenants";

type Params = { tenantId: string };

// Page: /dashboard/tenants/[tenantId] - its balance and rent months section
export const GET = ownerRoute<Params>((ctx, _request, { tenantId }) => getTenantAccount(ctx, tenantId));
