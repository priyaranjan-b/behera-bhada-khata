import { ownerRoute } from "@/server/http";
import { getNewPropertyForm } from "@/server/services/properties";

// Page: /dashboard/properties/new
export const GET = ownerRoute((ctx) => getNewPropertyForm(ctx));
