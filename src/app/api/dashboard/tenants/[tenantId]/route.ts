import { ownerRoute, readJson } from "@/server/http";
import { getTenantDetail, updateTenant } from "@/server/services/tenants";

type Params = { tenantId: string };

// Page: /dashboard/tenants/[tenantId]; PUT from /dashboard/tenants/[tenantId]/edit
export const GET = ownerRoute<Params>((ctx, _request, { tenantId }) => getTenantDetail(ctx, tenantId));
export const PUT = ownerRoute<Params>(async (ctx, request, { tenantId }) =>
  updateTenant(ctx, tenantId, await readJson(request))
);
