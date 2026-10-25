import { ownerRoute, readJson } from "@/server/http";
import { createUnit, listPropertyHouses } from "@/server/services/properties";

type Params = { propertyCode: string };

// Page: /dashboard/properties/[propertyCode] - its houses
export const GET = ownerRoute<Params>((ctx, _request, { propertyCode }) => listPropertyHouses(ctx, propertyCode));

// POST from /dashboard/properties/[propertyCode]/units/new
export const POST = ownerRoute<Params>(async (ctx, request, { propertyCode }) =>
  createUnit(ctx, propertyCode, await readJson(request))
);
