import { ownerRoute, readQuery } from "@/server/http";
import { getBillingPage } from "@/server/services/billing";

// The Billing grid on /billing: one page of the range, sorted, searched and filtered in SQL (A15)
export const GET = ownerRoute((ctx, request) => getBillingPage(ctx, readQuery(request)));
