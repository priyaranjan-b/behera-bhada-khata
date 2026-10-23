import { ownerRoute, readJson } from "@/server/http";
import { resendAdjustmentLink } from "@/server/services/adjustments";

type Params = { adjustmentId: string };

export const POST = ownerRoute<Params>(async (ctx, request, { adjustmentId }) =>
  resendAdjustmentLink(ctx, adjustmentId, await readJson(request))
);
