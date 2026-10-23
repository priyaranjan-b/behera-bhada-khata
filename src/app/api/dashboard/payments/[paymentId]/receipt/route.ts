import { ownerLinkRoute, redirectTo } from "@/server/http";
import { paymentReceiptUrl } from "@/server/services/payments";

type Params = { paymentId: string };

// Opened as a link: redirects to a short-lived signed PDF URL.
export const GET = ownerLinkRoute<Params>(async (ctx, _request, { paymentId }) =>
  redirectTo(await paymentReceiptUrl(ctx, paymentId))
);
