import { ownerRoute } from "@/server/http";
import { getPaymentsTotals } from "@/server/services/paymentsReport";

// Page: /payments (?from=yyyy-MM-dd&to=yyyy-MM-dd) - the stat cards, by the days only
export const GET = ownerRoute((ctx, request) =>
  getPaymentsTotals(ctx, Object.fromEntries(new URL(request.url).searchParams))
);
