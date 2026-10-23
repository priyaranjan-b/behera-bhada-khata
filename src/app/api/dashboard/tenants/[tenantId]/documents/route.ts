import { ownerRoute, readJsonWithFiles } from "@/server/http";
import { uploadTenantDocuments } from "@/server/services/tenantDocuments";

type Params = { tenantId: string };

// POST from /dashboard/tenants/[tenantId]/edit: multipart `payload` ({ documentType }) + `files`
export const POST = ownerRoute<Params>(async (ctx, request, { tenantId }) => {
  const { body, files } = await readJsonWithFiles(request, "files");
  return uploadTenantDocuments(ctx, tenantId, body, files);
});
