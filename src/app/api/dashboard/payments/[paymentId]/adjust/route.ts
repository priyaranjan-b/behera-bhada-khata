import { ownerRoute } from "@/server/http";
import { getAdjustPaymentForm } from "@/server/services/payments";

type Params = { paymentId: string };

// Page: /dashboard/payments/[paymentId]/adjust
export const GET = ownerRoute<Params>((ctx, _request, { paymentId }) => getAdjustPaymentForm(ctx, paymentId));
