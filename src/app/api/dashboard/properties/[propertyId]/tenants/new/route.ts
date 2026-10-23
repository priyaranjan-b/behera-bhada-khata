import { ownerRoute } from "@/server/http";
import { getPropertyHeader } from "@/server/services/properties";

type Params = { propertyId: string };

// Page: /dashboard/properties/[propertyId]/tenants/new
export const GET = ownerRoute<Params>((ctx, _request, { propertyId }) => getPropertyHeader(ctx, propertyId));
