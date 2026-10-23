import { fileResponse, ownerLinkRoute } from "@/server/http";
import { adjustmentReceipt } from "@/server/services/adjustments";

type Params = { adjustmentId: string };

// Opened as a link: downloads the adjustment's PDF (see the payment receipt route).
export const GET = ownerLinkRoute<Params>(async (ctx, _request, { adjustmentId }) =>
  fileResponse(await adjustmentReceipt(ctx, adjustmentId), "application/pdf")
);
