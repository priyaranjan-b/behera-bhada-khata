import { ownerRoute, readQuery } from "@/server/http";
import { getEarnings } from "@/server/services/earnings";

// Page: /earnings (?from=yyyy-MM&to=yyyy-MM&paidDirect=) - the months, their totals, cards and chart
export const GET = ownerRoute((ctx, request) => getEarnings(ctx, readQuery(request)));
