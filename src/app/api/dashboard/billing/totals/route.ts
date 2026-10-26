import { ownerRoute, readQuery } from "@/server/http";
import { getBillingTotals } from "@/server/services/billing";

// The Billing stat cards on /billing: totals of the whole range
export const GET = ownerRoute((ctx, request) => getBillingTotals(ctx, readQuery(request)));
