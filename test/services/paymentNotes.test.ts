import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, fakes, resetFakes, tenant } from "../fakes";
import { PAYMENT_NOTE_LIMITS } from "@/lib/validation";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { createPaymentNotePreset, deletePaymentNotePreset, listPaymentNotePresets, updatePaymentNotePreset } = await import(
  "@/server/services/paymentNotes"
);
const { getNewPaymentForm } = await import("@/server/services/payments");

const ctx = { ownerId: OWNER_ID };
const texts = async () => (await listPaymentNotePresets(ctx)).map((n) => n.text);

beforeEach(() => {
  resetFakes();
});

describe("quick payment notes", () => {
  it("adds trimmed notes, edits and deletes them, listed alphabetically", async () => {
    await createPaymentNotePreset(ctx, { text: "  Advance rent " });
    expect(await texts()).toEqual(["Advance rent", "Paid via UPI"]);

    const [advance] = await listPaymentNotePresets(ctx);
    await updatePaymentNotePreset(ctx, advance.id, { text: "Advance for next month" });
    expect(await texts()).toEqual(["Advance for next month", "Paid via UPI"]);

    await deletePaymentNotePreset(ctx, advance.id);
    expect(await texts()).toEqual(["Paid via UPI"]);
  });

  it("refuses a blank or duplicate note (any case), but an edit may keep its own text", async () => {
    await expect(createPaymentNotePreset(ctx, { text: "  " })).rejects.toMatchObject({ status: 400 });
    await expect(createPaymentNotePreset(ctx, { text: "paid VIA upi" })).rejects.toMatchObject({
      status: 409,
      message: '"Paid via UPI" is already in the list',
    });
    const [upi] = await listPaymentNotePresets(ctx);
    await updatePaymentNotePreset(ctx, upi.id, { text: "Paid via upi" });
    expect(await texts()).toEqual(["Paid via upi"]);
  });

  it(`keeps at most ${PAYMENT_NOTE_LIMITS.maxPresets} notes`, async () => {
    for (let i = 1; i < PAYMENT_NOTE_LIMITS.maxPresets; i++) await createPaymentNotePreset(ctx, { text: `Note ${i}` });
    await expect(createPaymentNotePreset(ctx, { text: "One too many" })).rejects.toMatchObject({ status: 400 });
  });

  it("404s a malformed or unknown id before touching the list", async () => {
    await expect(deletePaymentNotePreset(ctx, "not-a-uuid")).rejects.toMatchObject({ status: 404 });
    await expect(updatePaymentNotePreset(ctx, "not-a-uuid", { text: "x" })).rejects.toMatchObject({ status: 404 });
    expect(fakes.owner.paymentNotePresets.update).not.toHaveBeenCalled();
    const unknown = "00000000-0000-4000-8000-000000000999";
    await expect(deletePaymentNotePreset(ctx, unknown)).rejects.toMatchObject({ status: 404 });
    await expect(updatePaymentNotePreset(ctx, unknown, { text: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("offers the notes on the Record payment form", async () => {
    await createPaymentNotePreset(ctx, { text: "Advance rent" });
    expect((await getNewPaymentForm(ctx, tenant().id)).noteSuggestions).toEqual(["Advance rent", "Paid via UPI"]);
  });
});
