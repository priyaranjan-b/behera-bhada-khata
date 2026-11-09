import { fileResponse, tenantLinkRoute } from "@/server/http";
import { myReceipt } from "@/server/services/tenantPortal";

type Params = { adjustmentId: string };

// Opened as a link: the PDF of one of the tenant's own adjustments (A32), rate limited
export const GET = tenantLinkRoute<Params>(async (ctx, _request, { adjustmentId }) =>
  fileResponse(await myReceipt(ctx, "adjustment", adjustmentId), "application/pdf")
);
