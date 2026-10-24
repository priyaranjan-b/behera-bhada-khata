import { ownerRoute, readJson } from "@/server/http";
import { changePassword } from "@/server/services/profile";

// POST from /dashboard/profile (Password card)
export const POST = ownerRoute(async (ctx, request) => changePassword(ctx, await readJson(request)));
