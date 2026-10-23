import { ownerRoute } from "@/server/http";
import { getEditTenantForm } from "@/server/services/tenants";

type Params = { tenantId: string };

// Page: /dashboard/tenants/[tenantId]/edit
export const GET = ownerRoute<Params>((ctx, _request, { tenantId }) => getEditTenantForm(ctx, tenantId));
