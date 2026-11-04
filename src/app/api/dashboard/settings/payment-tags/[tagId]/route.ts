import { ownerRoute, readJson } from "@/server/http";
import { deletePaymentTag, updatePaymentTag } from "@/server/services/paymentTags";

type Params = { tagId: string };

export const PUT = ownerRoute<Params>(async (ctx, request, { tagId }) => updatePaymentTag(ctx, tagId, await readJson(request)));

export const DELETE = ownerRoute<Params>((ctx, _request, { tagId }) => deletePaymentTag(ctx, tagId));
