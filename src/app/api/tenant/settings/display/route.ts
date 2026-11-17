import { tenantRoute } from "@/server/http";
import { getMyDisplaySettings } from "@/server/services/displaySettings";

// The tenant portal's layout: dates shown the way the owner chose (A36)
export const GET = tenantRoute(async (ctx) => getMyDisplaySettings(ctx));
