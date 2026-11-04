import { ownerRoute, readJson } from "@/server/http";
import { getMaintenanceExpense, updateMaintenanceExpense } from "@/server/services/maintenance";

type Params = { expenseId: string };

// Page: /maintenance/[expenseId]
export const GET = ownerRoute<Params>((ctx, _request, { expenseId }) => getMaintenanceExpense(ctx, expenseId));

// PUT from /maintenance/[expenseId]/edit
export const PUT = ownerRoute<Params>(async (ctx, request, { expenseId }) =>
  updateMaintenanceExpense(ctx, expenseId, await readJson(request))
);
