import { ownerLinkRoute, ownerRoute, redirectTo } from "@/server/http";
import { deleteMaintenanceFile, maintenanceFileUrl } from "@/server/services/maintenance";

type Params = { expenseId: string; fileId: string };

// Opened as a link: redirects to a short-lived signed URL of the file.
export const GET = ownerLinkRoute<Params>(async (ctx, _request, { expenseId, fileId }) =>
  redirectTo(await maintenanceFileUrl(ctx, expenseId, fileId))
);

export const DELETE = ownerRoute<Params>((ctx, _request, { expenseId, fileId }) => deleteMaintenanceFile(ctx, expenseId, fileId));
