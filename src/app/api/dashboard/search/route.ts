import { ownerRoute } from "@/server/http";
import { getSearchIndex } from "@/server/services/search";

// Top-bar search (src/components/shell/Search.tsx); no page of its own.
export const GET = ownerRoute((ctx) => getSearchIndex(ctx));
