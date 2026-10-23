import { ownerRoute, readJson } from "@/server/http";
import { createUnit } from "@/server/services/properties";

type Params = { propertyCode: string };

// POST from /dashboard/properties/[propertyCode]/units/new
export const POST = ownerRoute<Params>(async (ctx, request, { propertyCode }) =>
  createUnit(ctx, propertyCode, await readJson(request))
);
