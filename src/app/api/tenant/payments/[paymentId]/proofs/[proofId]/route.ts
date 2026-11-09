import { redirectTo, tenantLinkRoute } from "@/server/http";
import { myProofUrl } from "@/server/services/tenantPortal";

type Params = { paymentId: string; proofId: string };

// Opened as a link: redirects to a short-lived signed URL of a proof on one of the tenant's own payments (A32)
export const GET = tenantLinkRoute<Params>(async (ctx, _request, { paymentId, proofId }) =>
  redirectTo(await myProofUrl(ctx, paymentId, proofId))
);
