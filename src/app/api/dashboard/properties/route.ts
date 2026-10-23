import { ownerRoute, readJson } from "@/server/http";
import { createProperty, listProperties } from "@/server/services/properties";

// Page: /dashboard/properties; POST from /dashboard/properties/new
export const GET = ownerRoute((ctx) => listProperties(ctx));
export const POST = ownerRoute(async (ctx, request) => createProperty(ctx, await readJson(request)));
