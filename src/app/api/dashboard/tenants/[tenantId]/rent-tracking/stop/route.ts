import { ownerRoute, readJson } from "@/server/http";
import { stopRentTracking } from "@/server/services/tenants";

type Params = { tenantId: string };

// POST from "Stop tracking" (with the corrections PIN, 0039), while nothing is recorded yet
export const POST = ownerRoute<Params>(async (ctx, request, { tenantId }) =>
  stopRentTracking(ctx, tenantId, await readJson(request))
);
