import { ownerRoute } from "@/server/http";
import { listPropertyTenants } from "@/server/services/properties";

type Params = { propertyCode: string };

// Page: /dashboard/properties/[propertyCode] - the tenants holding its houses today
export const GET = ownerRoute<Params>((ctx, _request, { propertyCode }) => listPropertyTenants(ctx, propertyCode));
