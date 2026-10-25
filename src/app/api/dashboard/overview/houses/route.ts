import { ownerRoute } from "@/server/http";
import { getHouseCounts } from "@/server/services/overview";

// Page: /dashboard
export const GET = ownerRoute((ctx) => getHouseCounts(ctx));
