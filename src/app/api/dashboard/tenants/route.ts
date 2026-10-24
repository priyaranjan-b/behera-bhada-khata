import { ownerRoute, readJson } from "@/server/http";
import { createTenant, listTenants } from "@/server/services/tenants";

// Page: /dashboard/tenants
export const GET = ownerRoute((ctx) => listTenants(ctx));
// POST from /dashboard/tenants/new (and the per-tower Add tenant page).
export const POST = ownerRoute(async (ctx, request) => createTenant(ctx, await readJson(request)));
