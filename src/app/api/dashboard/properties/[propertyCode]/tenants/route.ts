import { ownerRoute, readJson } from "@/server/http";
import { createTenant } from "@/server/services/tenants";

type Params = { propertyCode: string };

// POST from /dashboard/properties/[propertyCode]/tenants/new. The houses in
// the body decide where the tenant lives; they may span towers.
export const POST = ownerRoute<Params>(async (ctx, request) => createTenant(ctx, await readJson(request)));
