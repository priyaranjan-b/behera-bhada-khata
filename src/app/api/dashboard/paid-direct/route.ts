import { ownerRoute } from "@/server/http";
import { getPaidDirectState } from "@/server/services/paidDirect";

// Pages: /dashboard, /dashboard/billing (?paidDirect=show|hide) - the header switch
export const GET = ownerRoute((ctx, request) =>
  getPaidDirectState(ctx, { paidDirect: new URL(request.url).searchParams.get("paidDirect") })
);
