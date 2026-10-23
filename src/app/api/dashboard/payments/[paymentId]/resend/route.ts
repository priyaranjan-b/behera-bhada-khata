import { ownerRoute } from "@/server/http";
import { resendPaymentLink } from "@/server/services/payments";

type Params = { paymentId: string };

export const POST = ownerRoute<Params>((ctx, _request, { paymentId }) => resendPaymentLink(ctx, paymentId));
