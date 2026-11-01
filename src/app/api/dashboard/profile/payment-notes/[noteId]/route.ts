import { ownerRoute, readJson } from "@/server/http";
import { deletePaymentNotePreset, updatePaymentNotePreset } from "@/server/services/paymentNotes";

type Params = { noteId: string };

export const PUT = ownerRoute<Params>(async (ctx, request, { noteId }) =>
  updatePaymentNotePreset(ctx, noteId, await readJson(request))
);

export const DELETE = ownerRoute<Params>((ctx, _request, { noteId }) => deletePaymentNotePreset(ctx, noteId));
