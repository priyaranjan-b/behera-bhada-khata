import { ownerRoute, readJson } from "@/server/http";
import { resendPaymentLink } from "@/server/services/payments";

type Params = { paymentId: string };

export const POST = ownerRoute<Params>(async (ctx, request, { paymentId }) =>
  resendPaymentLink(ctx, paymentId, await readJson(request))
);
