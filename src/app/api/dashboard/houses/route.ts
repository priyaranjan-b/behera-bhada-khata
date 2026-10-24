import { ownerRoute } from "@/server/http";
import { listHouses } from "@/server/services/properties";

// Page: /dashboard/houses
export const GET = ownerRoute((ctx) => listHouses(ctx));
