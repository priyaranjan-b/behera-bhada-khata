import { ownerRoute, readJson } from "@/server/http";
import { createPaymentNotePreset, listPaymentNotePresets } from "@/server/services/paymentNotes";

// Page: /profile (Quick payment notes card)
export const GET = ownerRoute((ctx) => listPaymentNotePresets(ctx));

export const POST = ownerRoute(async (ctx, request) => createPaymentNotePreset(ctx, await readJson(request)));
