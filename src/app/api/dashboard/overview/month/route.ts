import { ownerRoute } from "@/server/http";
import { getOverviewMonth } from "@/server/services/overview";

// Page: /dashboard (?month=yyyy-MM&paidDirect=show|hide)
export const GET = ownerRoute((ctx, request) => {
  const params = new URL(request.url).searchParams;
  return getOverviewMonth(ctx, params.get("month"), { paidDirect: params.get("paidDirect") });
});
