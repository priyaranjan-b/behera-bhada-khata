import { ownerRoute } from "@/server/http";
import { getNewTenantForm } from "@/server/services/properties";

type Params = { propertyCode: string };

// Page: /dashboard/properties/[propertyCode]/tenants/new
export const GET = ownerRoute<Params>((ctx, _request, { propertyCode }) => getNewTenantForm(ctx, propertyCode));
