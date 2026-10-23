import { ownerRoute } from "@/server/http";
import { getPropertyDetail } from "@/server/services/properties";

type Params = { propertyId: string };

// Page: /dashboard/properties/[propertyId]
export const GET = ownerRoute<Params>((ctx, _request, { propertyId }) => getPropertyDetail(ctx, propertyId));
