import { ownerRoute, readQuery } from "@/server/http";
import { tenantHistory } from "@/server/services/audit";

type Params = { tenantId: string };

// The "Change history" table on /tenants/[tenantId]: one page, sorted, searched and filtered here (A14)
export const GET = ownerRoute<Params>((ctx, request, { tenantId }) => tenantHistory(ctx, tenantId, readQuery(request)));
