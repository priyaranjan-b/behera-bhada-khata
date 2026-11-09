import { tenantRoute } from "@/server/http";
import { getTenantPortalSession } from "@/server/services/tenantAuth";

// The tenant portal's header: who is signed in (A32)
export const GET = tenantRoute(async (ctx) => getTenantPortalSession(ctx));
