import { ownerRoute, readQuery } from "@/server/http";
import { tenantHistory } from "@/server/services/audit";

type Params = { tenantId: string };

// The "Change history" card on /dashboard/tenants/[tenantId] (?before=)
export const GET = ownerRoute<Params>((ctx, request, { tenantId }) => tenantHistory(ctx, tenantId, readQuery(request)));
