import { tenantRoute } from "@/server/http";
import { getMyAccount } from "@/server/services/tenantPortal";

// /tenant: what the tenant owes (A32)
export const GET = tenantRoute(async (ctx) => getMyAccount(ctx));
