import { ownerRoute, readJson } from "@/server/http";
import { getDisplaySettings, setDisplaySettings } from "@/server/services/displaySettings";

// GET for the app's layout (how the UI shows dates, A36); PUT from /settings (Date format card)
export const GET = ownerRoute(async (ctx) => getDisplaySettings(ctx));

export const PUT = ownerRoute(async (ctx, request) => setDisplaySettings(ctx, await readJson(request)));
