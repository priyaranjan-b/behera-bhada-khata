import { ownerLinkRoute, redirectTo } from "@/server/http";
import { paymentProofUrl } from "@/server/services/payments";

type Params = { paymentId: string; proofId: string };

// Opened as a link from the tenant ledger: redirects to a short-lived signed URL of the file.
export const GET = ownerLinkRoute<Params>(async (ctx, _request, { paymentId, proofId }) =>
  redirectTo(await paymentProofUrl(ctx, paymentId, proofId))
);
