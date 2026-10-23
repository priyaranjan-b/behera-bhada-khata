import { ownerRoute, readJson } from "@/server/http";
import { createPayment } from "@/server/services/payments";

type Params = { tenantId: string };

// POST from /dashboard/tenants/[tenantId]/payments/new
export const POST = ownerRoute<Params>(async (ctx, request, { tenantId }) =>
  createPayment(ctx, tenantId, await readJson(request))
);
