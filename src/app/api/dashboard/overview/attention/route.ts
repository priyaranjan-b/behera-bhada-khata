import { ownerRoute } from "@/server/http";
import { getAttention } from "@/server/services/overview";

// Page: /dashboard
export const GET = ownerRoute((ctx) => getAttention(ctx));
