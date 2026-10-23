import { ownerRoute } from "@/server/http";
import { getDashboardSummary } from "@/server/services/dashboard";

// Page: /dashboard (?month=yyyy-MM)
export const GET = ownerRoute((ctx, request) =>
  getDashboardSummary(ctx, new URL(request.url).searchParams.get("month"))
);
