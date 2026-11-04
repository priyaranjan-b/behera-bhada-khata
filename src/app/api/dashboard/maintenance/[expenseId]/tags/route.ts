import { ownerRoute, readJson } from "@/server/http";
import { setMaintenanceTags } from "@/server/services/maintenance";

type Params = { expenseId: string };

// PUT from /maintenance and /maintenance/[expenseId]: { tags } - who paid
export const PUT = ownerRoute<Params>(async (ctx, request, { expenseId }) =>
  setMaintenanceTags(ctx, expenseId, await readJson(request))
);
