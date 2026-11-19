import { ownerRoute } from "@/server/http";
import { getMaintenanceTotals } from "@/server/services/maintenance";

// Page: /maintenance (?from=yyyy-MM-dd&to=yyyy-MM-dd) - the stat cards, by the days only
export const GET = ownerRoute((ctx, request) =>
  getMaintenanceTotals(ctx, Object.fromEntries(new URL(request.url).searchParams))
);
