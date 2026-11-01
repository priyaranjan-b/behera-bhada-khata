import { ownerRoute } from "@/server/http";
import { getPaymentsPage } from "@/server/services/paymentsReport";

// Page: /payments (?from=yyyy-MM-dd&to=yyyy-MM-dd + the grid's page, sort, search, filters) - the table and its cards
export const GET = ownerRoute((ctx, request) =>
  getPaymentsPage(ctx, Object.fromEntries(new URL(request.url).searchParams))
);
