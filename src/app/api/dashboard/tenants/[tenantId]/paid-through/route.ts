import { ownerRoute, readJson } from "@/server/http";
import { correctPaidThrough } from "@/server/services/tenants";

type Params = { tenantId: string };

// POST from the "Correct" dialog next to "Billing from" on /dashboard/tenants/[tenantId]
export const POST = ownerRoute<Params>(async (ctx, request, { tenantId }) =>
  correctPaidThrough(ctx, tenantId, await readJson(request))
);
