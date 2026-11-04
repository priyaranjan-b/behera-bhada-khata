import { ownerRoute } from "@/server/http";
import { getMaintenanceForm } from "@/server/services/maintenance";

// Page: /maintenance/new and /maintenance/[expenseId]/edit - the houses and who-paid suggestions
export const GET = ownerRoute((ctx) => getMaintenanceForm(ctx));
