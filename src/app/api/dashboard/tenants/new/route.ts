import { ownerRoute } from "@/server/http";
import { getAnyTowerTenantForm } from "@/server/services/tenants";

// Page: /dashboard/tenants/new
export const GET = ownerRoute((ctx) => getAnyTowerTenantForm(ctx));
