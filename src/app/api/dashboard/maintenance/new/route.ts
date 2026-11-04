import { ownerRoute, readQuery } from "@/server/http";
import { getMaintenanceForm } from "@/server/services/maintenance";

// Page: /maintenance/new (?fromPayment= a set-off, A22) and /maintenance/[expenseId]/edit - the houses and who-paid suggestions
export const GET = ownerRoute((ctx, request) => getMaintenanceForm(ctx, readQuery(request)));
