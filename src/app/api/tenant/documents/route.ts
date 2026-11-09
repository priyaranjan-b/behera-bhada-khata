import { tenantRoute } from "@/server/http";
import { getMyDocuments } from "@/server/services/tenantPortal";

// /tenant's Documents tab: the files the owner keeps on the tenant (A32)
export const GET = tenantRoute(async (ctx) => getMyDocuments(ctx));
