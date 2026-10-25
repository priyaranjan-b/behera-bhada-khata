import { ownerRoute } from "@/server/http";
import { getDashboardSummary } from "@/server/services/dashboard";

// Page: /dashboard (?month=yyyy-MM&paidDirect=show|hide)
export const GET = ownerRoute((ctx, request) => {
  const params = new URL(request.url).searchParams;
  return getDashboardSummary(ctx, params.get("month"), { paidDirect: params.get("paidDirect") });
});
