import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, PNG_DATA_URL, fakes, resetFakes, tenant } from "../fakes";
import { PAYMENT_TAG_LIMITS } from "@/lib/validation";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { createPaymentTag, deletePaymentTag, getPaymentTagSuggestions, listPaymentTags, setPaymentTags, updatePaymentTag } =
  await import("@/server/services/paymentTags");
const { createPayment, getNewPaymentForm } = await import("@/server/services/payments");

const ctx = { ownerId: OWNER_ID };
const PAYMENT = "00000000-0000-4000-8000-000000000201";
const names = async () => (await listPaymentTags(ctx)).map((t) => t.name);

beforeEach(() => {
  resetFakes();
});

describe("payment tag suggestions", () => {
  it("adds trimmed tags, renames and deletes them, listed alphabetically", async () => {
    await createPaymentTag(ctx, { name: "  Malati " });
    expect(await names()).toEqual(["Malati", "Padma"]);

    const [malati] = await listPaymentTags(ctx);
    await updatePaymentTag(ctx, malati.id, { name: "Malati Sahu" });
    expect(await names()).toEqual(["Malati Sahu", "Padma"]);

    await deletePaymentTag(ctx, malati.id);
    expect(await names()).toEqual(["Padma"]);
  });

  it("refuses a blank, too long or duplicate tag (any case)", async () => {
    await expect(createPaymentTag(ctx, { name: " " })).rejects.toMatchObject({ status: 400 });
    await expect(createPaymentTag(ctx, { name: "x".repeat(PAYMENT_TAG_LIMITS.maxLength + 1) })).rejects.toMatchObject({
      status: 400,
    });
    await expect(createPaymentTag(ctx, { name: "PADMA" })).rejects.toMatchObject({
      status: 409,
      message: '"Padma" is already a tag',
    });
  });

  it(`keeps at most ${PAYMENT_TAG_LIMITS.maxTags} tags, typed on a payment too`, async () => {
    for (let i = 1; i < PAYMENT_TAG_LIMITS.maxTags; i++) await createPaymentTag(ctx, { name: `Tag ${i}` });
    await expect(createPaymentTag(ctx, { name: "One too many" })).rejects.toMatchObject({ status: 400 });
    await expect(setPaymentTags(ctx, PAYMENT, { tags: ["One too many"] })).rejects.toMatchObject({ status: 400 });
    // A known name is fine.
    expect(await setPaymentTags(ctx, PAYMENT, { tags: ["padma"] })).toEqual({ tags: ["Padma"] });
  });

  it("404s a malformed or unknown id", async () => {
    await expect(deletePaymentTag(ctx, "not-a-uuid")).rejects.toMatchObject({ status: 404 });
    await expect(updatePaymentTag(ctx, "not-a-uuid", { name: "x" })).rejects.toMatchObject({ status: 404 });
    expect(fakes.owner.paymentTags.update).not.toHaveBeenCalled();
    const unknown = "00000000-0000-4000-8000-000000000999";
    await expect(deletePaymentTag(ctx, unknown)).rejects.toMatchObject({ status: 404 });
    await expect(updatePaymentTag(ctx, unknown, { name: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("offers the names on Record payment and on the Payments page", async () => {
    await createPaymentTag(ctx, { name: "Malati" });
    expect((await getNewPaymentForm(ctx, tenant().id)).tagSuggestions).toEqual(["Malati", "Padma"]);
    expect(await getPaymentTagSuggestions(ctx)).toEqual(["Malati", "Padma"]);
  });
  it("opens the payment form and the tag editor with no suggestions when they can't be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fakes.owner.paymentTags.list.mockRejectedValueOnce(new Error("db down"));
    expect((await getNewPaymentForm(ctx, tenant().id)).tagSuggestions).toEqual([]);
    fakes.owner.paymentTags.list.mockRejectedValueOnce(new Error("db down"));
    expect(await getPaymentTagSuggestions(ctx)).toEqual([]);
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

describe("setPaymentTags", () => {
  it("replaces a payment's tags; a new name joins the suggestions, a known one keeps its spelling", async () => {
    expect(await setPaymentTags(ctx, PAYMENT, { tags: ["padma", " Ravi ", "RAVI"] })).toEqual({ tags: ["Padma", "Ravi"] });
    expect(await names()).toEqual(["Padma", "Ravi"]);
    expect((await listPaymentTags(ctx)).map((t) => t.paymentCount)).toEqual([1, 1]);

    expect(await setPaymentTags(ctx, PAYMENT, { tags: ["Ravi"] })).toEqual({ tags: ["Ravi"] });
    expect(await setPaymentTags(ctx, PAYMENT, { tags: [] })).toEqual({ tags: [] });
  });

  it("keeps a payment's names when the suggestion is renamed or deleted", async () => {
    await setPaymentTags(ctx, PAYMENT, { tags: ["Padma"] });
    const [padma] = await listPaymentTags(ctx);
    await updatePaymentTag(ctx, padma.id, { name: "Padmini" });
    expect(fakes.state.paymentTags.get(PAYMENT)).toEqual(["Padma"]);
    await deletePaymentTag(ctx, padma.id);
    expect(fakes.state.paymentTags.get(PAYMENT)).toEqual(["Padma"]);
  });

  it(`refuses more than ${PAYMENT_TAG_LIMITS.maxPerPayment} tags, and 404s an unknown payment`, async () => {
    const many = Array.from({ length: PAYMENT_TAG_LIMITS.maxPerPayment + 1 }, (_, i) => `T${i}`);
    await expect(setPaymentTags(ctx, PAYMENT, { tags: many })).rejects.toMatchObject({ status: 400 });
    await expect(setPaymentTags(ctx, "not-a-uuid", { tags: [] })).rejects.toMatchObject({ status: 404 });
    await expect(setPaymentTags(ctx, "00000000-0000-4000-8000-000000000999", { tags: [] })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("createPayment with tags", () => {
  const tenantId = "7f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f";
  const body = {
    amount: 5000,
    paymentDate: "2026-03-05",
    mode: "cash",
    allocations: [{ rentPeriodId: "6f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f", amountAllocated: 5000 }],
    ownerSignaturePng: PNG_DATA_URL,
    notifyTenant: false,
  };

  beforeEach(() => {
    fakes.state.tenants.set(tenantId, tenant({ id: tenantId }));
  });

  it("passes the de-duplicated tags to the database with the payment", async () => {
    await createPayment(ctx, tenantId, { ...body, tags: ["Padma", "padma", "Ravi"] });
    const [call] = fakes.owner.payments.create.mock.calls as unknown as [[unknown, unknown, unknown, string[]]];
    expect(call[3]).toEqual(["Padma", "Ravi"]);
  });

  it("defaults to no tags", async () => {
    await createPayment(ctx, tenantId, body);
    const [call] = fakes.owner.payments.create.mock.calls as unknown as [[unknown, unknown, unknown, string[]]];
    expect(call[3]).toEqual([]);
  });
});
