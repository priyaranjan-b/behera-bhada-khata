import { ownerRoute } from "@/server/http";
import { getPropertyHeader } from "@/server/services/properties";

type Params = { propertyCode: string };

// Page: /dashboard/properties/[propertyCode]/units/new
export const GET = ownerRoute<Params>((ctx, _request, { propertyCode }) => getPropertyHeader(ctx, propertyCode));
