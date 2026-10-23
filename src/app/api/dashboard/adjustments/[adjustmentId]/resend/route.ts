import { ownerRoute } from "@/server/http";
import { resendAdjustmentLink } from "@/server/services/adjustments";

type Params = { adjustmentId: string };

export const POST = ownerRoute<Params>((ctx, _request, { adjustmentId }) => resendAdjustmentLink(ctx, adjustmentId));
