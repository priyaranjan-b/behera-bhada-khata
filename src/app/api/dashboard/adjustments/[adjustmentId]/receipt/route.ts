import { ownerLinkRoute, redirectTo } from "@/server/http";
import { adjustmentReceiptUrl } from "@/server/services/adjustments";

type Params = { adjustmentId: string };

// Opened as a link: redirects to a short-lived signed PDF URL.
export const GET = ownerLinkRoute<Params>(async (ctx, _request, { adjustmentId }) =>
  redirectTo(await adjustmentReceiptUrl(ctx, adjustmentId))
);
