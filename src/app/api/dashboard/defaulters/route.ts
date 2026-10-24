import { ownerRoute } from "@/server/http";
import { getDefaultersReport } from "@/server/services/dashboard";

// Page: /dashboard/defaulters
export const GET = ownerRoute((ctx) => getDefaultersReport(ctx));
