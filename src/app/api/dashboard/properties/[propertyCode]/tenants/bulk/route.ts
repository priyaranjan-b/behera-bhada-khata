import { ownerRoute, readJson } from "@/server/http";
import { getNewTenantForm } from "@/server/services/properties";
import { bulkCreateTenants } from "@/server/services/tenants";

type Params = { propertyCode: string };

// Page: /dashboard/properties/[propertyCode]/tenants/bulk
export const GET = ownerRoute<Params>((ctx, _request, { propertyCode }) => getNewTenantForm(ctx, propertyCode));
export const POST = ownerRoute<Params>(async (ctx, request) => {
  const body = (await readJson(request)) as { tenants?: unknown } | null;
  return bulkCreateTenants(ctx, body?.tenants ?? []);
});
