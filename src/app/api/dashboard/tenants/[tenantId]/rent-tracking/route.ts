import { ownerRoute, readJson } from "@/server/http";
import { startRentTracking, stopRentTracking } from "@/server/services/tenants";

type Params = { tenantId: string };

// POST from "Start tracking rent" on /dashboard/tenants/[tenantId] (government tenants, 0016)
export const POST = ownerRoute<Params>(async (ctx, request, { tenantId }) =>
  startRentTracking(ctx, tenantId, await readJson(request))
);

// DELETE from "Stop tracking", while nothing is recorded yet
export const DELETE = ownerRoute<Params>(async (ctx, _request, { tenantId }) => stopRentTracking(ctx, tenantId));
