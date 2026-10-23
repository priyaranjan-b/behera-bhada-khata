import { ownerRoute, readJsonWithFiles } from "@/server/http";
import { createPayment } from "@/server/services/payments";

type Params = { tenantId: string };

// POST from /dashboard/tenants/[tenantId]/payments/new (JSON, or multipart with proof files)
export const POST = ownerRoute<Params>(async (ctx, request, { tenantId }) => {
  const { body, files } = await readJsonWithFiles(request, "proofs");
  return createPayment(ctx, tenantId, body, files);
});
