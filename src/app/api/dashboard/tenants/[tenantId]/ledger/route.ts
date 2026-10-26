import { ownerRoute, readQuery } from "@/server/http";
import { getTenantLedger } from "@/server/services/tenants";

type Params = { tenantId: string };

// The "Ledger" table on /tenants/[tenantId]: one page, sorted, searched and filtered in SQL (A15)
export const GET = ownerRoute<Params>((ctx, request, { tenantId }) => getTenantLedger(ctx, tenantId, readQuery(request)));
