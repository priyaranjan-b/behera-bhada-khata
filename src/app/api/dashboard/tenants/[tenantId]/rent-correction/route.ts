import { ownerRoute, readJson } from "@/server/http";
import { correctRent } from "@/server/services/tenants";

type Params = { tenantId: string };

// POST from the "Correct" dialog next to "Combined rent" on /tenants/[tenantId]
export const POST = ownerRoute<Params>(async (ctx, request, { tenantId }) =>
  correctRent(ctx, tenantId, await readJson(request))
);
