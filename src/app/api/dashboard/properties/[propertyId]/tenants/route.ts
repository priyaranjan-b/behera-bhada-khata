import { ownerRoute, readJson } from "@/server/http";
import { createTenant } from "@/server/services/tenants";

type Params = { propertyId: string };

// POST from /dashboard/properties/[propertyId]/tenants/new
export const POST = ownerRoute<Params>(async (ctx, request, { propertyId }) =>
  createTenant(ctx, propertyId, await readJson(request))
);
