import { ownerLinkRoute, ownerRoute, redirectTo } from "@/server/http";
import { deleteTenantDocument, tenantDocumentUrl } from "@/server/services/tenantDocuments";

type Params = { tenantId: string; documentId: string };

// Opened as a link: redirects to a short-lived signed URL of the file.
export const GET = ownerLinkRoute<Params>(async (ctx, _request, { tenantId, documentId }) =>
  redirectTo(await tenantDocumentUrl(ctx, tenantId, documentId))
);

export const DELETE = ownerRoute<Params>((ctx, _request, { tenantId, documentId }) =>
  deleteTenantDocument(ctx, tenantId, documentId)
);
