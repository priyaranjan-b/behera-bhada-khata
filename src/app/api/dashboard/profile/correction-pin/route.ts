import { ownerRoute, readJson } from "@/server/http";
import { getCorrectionPin, setCorrectionPin } from "@/server/services/corrections";

// GET for /profile (Corrections PIN card) and the correction dialogs
export const GET = ownerRoute(async (ctx) => getCorrectionPin(ctx));

// PUT from /profile: set the first PIN, or change it with the current one (0039)
export const PUT = ownerRoute(async (ctx, request) => setCorrectionPin(ctx, await readJson(request)));
