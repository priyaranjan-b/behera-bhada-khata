import { ownerRoute, readJsonWithFiles } from "@/server/http";
import { addMaintenanceFiles } from "@/server/services/maintenance";

type Params = { expenseId: string };

// POST from /maintenance/[expenseId]: multipart `files`
export const POST = ownerRoute<Params>(async (ctx, request, { expenseId }) => {
  const { files } = await readJsonWithFiles(request, "files");
  return addMaintenanceFiles(ctx, expenseId, files);
});
