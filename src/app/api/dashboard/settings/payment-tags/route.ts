import { ownerRoute, readJson } from "@/server/http";
import { createPaymentTag, listPaymentTags } from "@/server/services/paymentTags";

// Page: /profile (Payment tags card)
export const GET = ownerRoute((ctx) => listPaymentTags(ctx));

export const POST = ownerRoute(async (ctx, request) => createPaymentTag(ctx, await readJson(request)));
