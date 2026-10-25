import { ownerRoute } from "@/server/http";
import { getBillingReceived } from "@/server/services/billing";

// Page: /dashboard/billing (?from=yyyy-MM&to=yyyy-MM&paidDirect=show|hide) - the Received card
export const GET = ownerRoute((ctx, request) =>
  getBillingReceived(ctx, Object.fromEntries(new URL(request.url).searchParams))
);
