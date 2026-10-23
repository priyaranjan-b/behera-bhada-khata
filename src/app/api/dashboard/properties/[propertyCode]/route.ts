import { ownerRoute } from "@/server/http";
import { getPropertyDetail } from "@/server/services/properties";

type Params = { propertyCode: string };

// Page: /dashboard/properties/[propertyCode]
export const GET = ownerRoute<Params>((ctx, _request, { propertyCode }) => getPropertyDetail(ctx, propertyCode));
