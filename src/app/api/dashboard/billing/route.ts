import { ownerRoute } from "@/server/http";
import { getBillingReport } from "@/server/services/billing";

// Page: /dashboard/billing (?from=yyyy-MM&to=yyyy-MM)
export const GET = ownerRoute((ctx, request) =>
  getBillingReport(ctx, Object.fromEntries(new URL(request.url).searchParams))
);
