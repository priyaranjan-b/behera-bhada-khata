import { ownerRoute, readJson } from "@/server/http";
import { moveOutTenant } from "@/server/services/tenants";

type Params = { tenantId: string };

// POST from the "Move out" dialog on /dashboard/tenants/[tenantId]
export const POST = ownerRoute<Params>(async (ctx, request, { tenantId }) =>
  moveOutTenant(ctx, tenantId, await readJson(request))
);
