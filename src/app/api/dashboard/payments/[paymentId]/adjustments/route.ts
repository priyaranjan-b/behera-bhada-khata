import { ownerRoute, readJson } from "@/server/http";
import { createAdjustment } from "@/server/services/adjustments";

type Params = { paymentId: string };

// POST from /dashboard/payments/[paymentId]/adjust
export const POST = ownerRoute<Params>(async (ctx, request, { paymentId }) =>
  createAdjustment(ctx, paymentId, await readJson(request))
);
