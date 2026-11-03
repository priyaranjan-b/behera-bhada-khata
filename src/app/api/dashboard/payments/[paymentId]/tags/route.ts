import { ownerRoute, readJson } from "@/server/http";
import { setPaymentTags } from "@/server/services/paymentTags";

type Params = { paymentId: string };

// Page: /payments - replaces the payment's tags
export const PUT = ownerRoute<Params>(async (ctx, request, { paymentId }) =>
  setPaymentTags(ctx, paymentId, await readJson(request))
);
