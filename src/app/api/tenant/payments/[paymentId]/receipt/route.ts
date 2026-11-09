import { fileResponse, tenantLinkRoute } from "@/server/http";
import { myReceipt } from "@/server/services/tenantPortal";

type Params = { paymentId: string };

// Opened as a link: the PDF receipt of one of the tenant's own payments (A32), rate limited
export const GET = tenantLinkRoute<Params>(async (ctx, _request, { paymentId }) =>
  fileResponse(await myReceipt(ctx, "payment", paymentId), "application/pdf")
);
