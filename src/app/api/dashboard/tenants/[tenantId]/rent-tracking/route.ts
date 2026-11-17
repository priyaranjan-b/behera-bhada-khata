import { ownerRoute, readJson } from "@/server/http";
import { startRentTracking } from "@/server/services/tenants";

type Params = { tenantId: string };

// POST from "Start tracking rent" on /dashboard/tenants/[tenantId] (government tenants, 0016)
export const POST = ownerRoute<Params>(async (ctx, request, { tenantId }) =>
  startRentTracking(ctx, tenantId, await readJson(request))
);

// Stop tracking is POST …/rent-tracking/stop: it carries the corrections PIN (0039).
