import { ownerRoute, readJson } from "@/server/http";
import { getPropertyHeader } from "@/server/services/properties";
import { bulkCreateTenants } from "@/server/services/tenants";

type Params = { propertyId: string };

// Page: /dashboard/properties/[propertyId]/tenants/bulk
export const GET = ownerRoute<Params>((ctx, _request, { propertyId }) => getPropertyHeader(ctx, propertyId));
export const POST = ownerRoute<Params>(async (ctx, request, { propertyId }) => {
  const body = (await readJson(request)) as { tenants?: unknown } | null;
  return bulkCreateTenants(ctx, propertyId, body?.tenants ?? []);
});
