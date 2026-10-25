import { ownerRoute } from "@/server/http";
import { getOverviewTrend } from "@/server/services/overview";

// Page: /dashboard (?paidDirect=show|hide)
export const GET = ownerRoute((ctx, request) =>
  getOverviewTrend(ctx, { paidDirect: new URL(request.url).searchParams.get("paidDirect") })
);
