import { publicRoute } from "@/server/http";
import { signOutTenant } from "@/server/services/tenantAuth";

// POST from the tenant portal's Sign out (A32)
export const POST = publicRoute(async () => signOutTenant());
