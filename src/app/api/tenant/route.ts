import { tenantRoute } from "@/server/http";
import { getMyProfile } from "@/server/services/tenantPortal";

// /tenant: the signed-in tenant's profile, read-only (A32)
export const GET = tenantRoute(async (ctx) => getMyProfile(ctx));
