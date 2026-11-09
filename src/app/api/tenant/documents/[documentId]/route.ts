import { redirectTo, tenantLinkRoute } from "@/server/http";
import { myDocumentUrl } from "@/server/services/tenantPortal";

type Params = { documentId: string };

// Opened as a link: redirects to a short-lived signed URL of one of the tenant's own documents (A32)
export const GET = tenantLinkRoute<Params>(async (ctx, _request, { documentId }) => redirectTo(await myDocumentUrl(ctx, documentId)));
