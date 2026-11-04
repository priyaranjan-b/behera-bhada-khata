import { ownerRoute, readQuery } from "@/server/http";
import { maintenanceHistory } from "@/server/services/audit";

type Params = { expenseId: string };

// The History card on /maintenance/[expenseId] (?before=)
export const GET = ownerRoute<Params>((ctx, request, { expenseId }) => maintenanceHistory(ctx, expenseId, readQuery(request)));
