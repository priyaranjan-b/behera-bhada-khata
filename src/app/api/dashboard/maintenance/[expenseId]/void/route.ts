import { ownerRoute, readJson } from "@/server/http";
import { voidMaintenanceExpense } from "@/server/services/maintenance";

type Params = { expenseId: string };

// POST from /maintenance/[expenseId]: { reason }
export const POST = ownerRoute<Params>(async (ctx, request, { expenseId }) =>
  voidMaintenanceExpense(ctx, expenseId, await readJson(request))
);
