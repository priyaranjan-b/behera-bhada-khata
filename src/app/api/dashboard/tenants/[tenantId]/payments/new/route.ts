import { ownerRoute } from "@/server/http";
import { getNewPaymentForm } from "@/server/services/payments";

type Params = { tenantId: string };

// Page: /dashboard/tenants/[tenantId]/payments/new
export const GET = ownerRoute<Params>((ctx, _request, { tenantId }) => getNewPaymentForm(ctx, tenantId));
