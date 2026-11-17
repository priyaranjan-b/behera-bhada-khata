import { ownerRoute, readJson } from "@/server/http";
import { correctMoveOut } from "@/server/services/tenants";

type Params = { tenantId: string };

// POST from the "Correct" dialog next to a moved-out tenant's status on /tenants/[tenantId]
export const POST = ownerRoute<Params>(async (ctx, request, { tenantId }) =>
  correctMoveOut(ctx, tenantId, await readJson(request))
);
