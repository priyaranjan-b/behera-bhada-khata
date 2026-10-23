import { fileResponse, ownerLinkRoute } from "@/server/http";
import { paymentReceipt } from "@/server/services/payments";

type Params = { paymentId: string };

// Opened as a link: downloads the PDF receipt (owner-signed, or the
// tenant-signed copy once acknowledged), e.g. to send on over WhatsApp.
export const GET = ownerLinkRoute<Params>(async (ctx, _request, { paymentId }) =>
  fileResponse(await paymentReceipt(ctx, paymentId), "application/pdf")
);
