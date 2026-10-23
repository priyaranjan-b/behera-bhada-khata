import { ownerRoute } from "@/server/http";
import { listTenants } from "@/server/services/tenants";

// Page: /dashboard/tenants
export const GET = ownerRoute((ctx) => listTenants(ctx));
