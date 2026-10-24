import { ownerRoute } from "@/server/http";
import { getNewHouseForm } from "@/server/services/properties";

// Page: /dashboard/houses/new (POST goes to the chosen tower's /units)
export const GET = ownerRoute((ctx) => getNewHouseForm(ctx));
