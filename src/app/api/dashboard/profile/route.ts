import { ownerRoute, readJson } from "@/server/http";
import { getOwnerProfile, updateOwnerProfile } from "@/server/services/profile";

// Page: /dashboard/profile (also the owner's name in the app shell)
export const GET = ownerRoute((ctx) => getOwnerProfile(ctx));

export const PUT = ownerRoute(async (ctx, request) => updateOwnerProfile(ctx, await readJson(request)));
