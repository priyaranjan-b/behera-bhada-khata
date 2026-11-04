import "server-only";
import type { PaymentTagView, PaymentTagsView } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import { PAYMENT_TAG_LIMITS, paymentTagSchema, setPaymentTagsSchema } from "@/lib/validation";
import { ownerDb } from "@/server/infra";
import type { OwnerRepositories } from "@/server/ports";
import { notFound, parseInput, requireId, type OwnerContext } from "./context";

// Payment tags (0030, D34): labels the owner puts on payments (who collected
// it, ...). Each payment keeps its own copy of its tag names; the list here
// only offers them. It's managed on the Settings page, and a name typed while
// recording or editing a payment joins it. Renaming or deleting one never
// changes a payment.

export async function listPaymentTags(_ctx: OwnerContext): Promise<PaymentTagView[]> {
  const db = await ownerDb();
  return (await db.paymentTags.list()).map(({ id, name, payment_count }) => ({ id, name, paymentCount: payment_count }));
}

/**
 * The suggested names, alphabetical, for the payment form and the tag
 * editor. Only a convenience: if they can't be read the form still opens
 * with none (any name can be typed), so the failure is logged, not thrown.
 */
export async function paymentTagSuggestions(db: OwnerRepositories): Promise<string[]> {
  try {
    return (await db.paymentTags.list()).map((t) => t.name);
  } catch (err) {
    console.error("paymentTagSuggestions: reading payment tags failed, offering none:", err);
    return [];
  }
}

/** The Payments page's tag editor. */
export async function getPaymentTagSuggestions(_ctx: OwnerContext): Promise<string[]> {
  return paymentTagSuggestions(await ownerDb());
}

export async function createPaymentTag(_ctx: OwnerContext, body: unknown): Promise<void> {
  const { name } = parseInput(paymentTagSchema, body);
  const db = await ownerDb();
  const existing = await db.paymentTags.list();
  refuseDuplicate(existing, name);
  refuseFullList(existing.length + 1);
  await db.paymentTags.create(name);
}

export async function updatePaymentTag(_ctx: OwnerContext, tagId: string, body: unknown): Promise<void> {
  requireId(tagId, "Tag");
  const { name } = parseInput(paymentTagSchema, body);
  const db = await ownerDb();
  refuseDuplicate(await db.paymentTags.list(), name, tagId);
  if (!(await db.paymentTags.update(tagId, name))) notFound("Tag");
}

/** Payments that carry the name keep it. */
export async function deletePaymentTag(_ctx: OwnerContext, tagId: string): Promise<void> {
  requireId(tagId, "Tag");
  const db = await ownerDb();
  if (!(await db.paymentTags.remove(tagId))) notFound("Tag");
}

/** Replaces a payment's tags (the Payments page). */
export async function setPaymentTags(_ctx: OwnerContext, paymentId: string, body: unknown): Promise<PaymentTagsView> {
  requireId(paymentId, "Payment");
  const { tags } = parseInput(setPaymentTagsSchema, body);
  const db = await ownerDb();
  await checkNewTags(db, tags);
  const saved = await db.payments.setTags(paymentId, tags);
  if (!saved) notFound("Payment");
  return { tags: saved };
}

/** Names not yet among the suggestions join them; refuses them if that would make the list too long. */
export async function checkNewTags(db: OwnerRepositories, names: string[]): Promise<void> {
  if (names.length === 0) return;
  const known = new Set((await db.paymentTags.list()).map((t) => t.name.toLowerCase()));
  const added = names.filter((n) => !known.has(n.toLowerCase())).length;
  if (added > 0) refuseFullList(known.size + added);
}

function refuseFullList(count: number) {
  if (count > PAYMENT_TAG_LIMITS.maxTags) {
    throw new ApiError(400, `Keep at most ${PAYMENT_TAG_LIMITS.maxTags} tags; delete an unused one on the Settings page first`);
  }
}

/** The unique index (any case) would refuse it too; this says which tag. */
function refuseDuplicate(existing: { id: string; name: string }[], name: string, exceptId?: string) {
  const clash = existing.find((t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new ApiError(409, `"${clash.name}" is already a tag`);
}
