import { ownerRoute } from "@/server/http";
import { getPortfolio } from "@/server/services/overview";

// Page: /dashboard (?paidDirect=show|hide)
export const GET = ownerRoute((ctx, request) =>
  getPortfolio(ctx, { paidDirect: new URL(request.url).searchParams.get("paidDirect") })
);
