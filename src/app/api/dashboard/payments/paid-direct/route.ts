import { ownerRoute } from "@/server/http";
import { getPaymentsPaidDirect } from "@/server/services/paymentsReport";

// Page: /payments (?from=yyyy-MM-dd&to=yyyy-MM-dd) - the Govt paid direct card
export const GET = ownerRoute((ctx, request) =>
  getPaymentsPaidDirect(ctx, Object.fromEntries(new URL(request.url).searchParams))
);
