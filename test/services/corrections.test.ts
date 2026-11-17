import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_PIN, OWNER_ID, PNG_DATA_URL, fakes, resetFakes } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { getCorrectionPin, setCorrectionPin } = await import("@/server/services/corrections");
const { createAdjustment } = await import("@/server/services/adjustments");

const ctx = { ownerId: OWNER_ID };
const PAYMENT = "00000000-0000-4000-8000-000000000201";
const adjustment = {
  deltaAmount: -500,
  reason: "Counted twice",
  allocations: [{ rentPeriodId: "00000000-0000-4000-8000-000000000301", amountDelta: -500 }],
  ownerSignaturePng: PNG_DATA_URL,
  notifyTenant: false,
};

beforeEach(() => {
  resetFakes();
});

describe("a payment adjustment, confirmed with the corrections PIN (0039)", () => {
  it("checks the PIN for that payment, then records it with the ticket", async () => {
    await createAdjustment(ctx, PAYMENT, { ...adjustment, pin: FAKE_PIN });
    expect(fakes.owner.adjustments.create).toHaveBeenCalledWith(
      expect.objectContaining({ original_payment_id: PAYMENT, delta_amount: -500 }),
      [{ rent_period_id: adjustment.allocations[0].rentPeriodId, amount: -500 }],
      { pin: FAKE_PIN }
    );
  });

  it("a wrong PIN is refused on the PIN field and leaves no signature file behind", async () => {
    await expect(createAdjustment(ctx, PAYMENT, { ...adjustment, pin: "000000" })).rejects.toMatchObject({
      status: 400,
      field: "pin",
      message: "Wrong PIN. 4 tries left before corrections lock.",
    });
    // The signature was stored for the write, then removed when the PIN failed.
    expect(fakes.storage.upload).toHaveBeenCalledTimes(1);
    expect(fakes.storage.remove).toHaveBeenCalledTimes(1);
    expect(fakes.state.files.size).toBe(0);
    // A missing PIN never gets that far.
    await expect(createAdjustment(ctx, PAYMENT, adjustment)).rejects.toMatchObject({ status: 400 });
    expect(fakes.storage.upload).toHaveBeenCalledTimes(1);
  });

  it("refuses before uploading anything while corrections are locked", async () => {
    fakes.owner.corrections.status.mockResolvedValueOnce({
      pinSet: true,
      pinSetAt: null,
      lockedUntil: "2026-11-18T10:50:00Z",
      setupUntil: null,
    });
    await expect(createAdjustment(ctx, PAYMENT, { ...adjustment, pin: FAKE_PIN })).rejects.toMatchObject({
      status: 409,
      field: "pin",
    });
    expect(fakes.storage.upload).not.toHaveBeenCalled();
    expect(fakes.owner.adjustments.create).not.toHaveBeenCalled();
  });
});

describe("the corrections PIN on Profile", () => {
  it("reports whether one is set", async () => {
    expect(await getCorrectionPin(ctx)).toEqual({
      pinSet: true,
      pinSetAt: "2026-11-01T00:00:00Z",
      lockedUntil: null,
      setupUntil: null,
    });
  });

  it("sets the first PIN, and changes it only with the current one", async () => {
    await setCorrectionPin(ctx, { pin: "135790" });
    expect(fakes.owner.corrections.setPin).toHaveBeenCalledWith("135790", null);

    await setCorrectionPin(ctx, { pin: "135790", currentPin: FAKE_PIN });
    expect(fakes.owner.corrections.setPin).toHaveBeenLastCalledWith("135790", FAKE_PIN);
    await expect(setCorrectionPin(ctx, { pin: "135790", currentPin: "111111" })).rejects.toMatchObject({
      status: 400,
      message: "Wrong PIN. 4 tries left before corrections lock.",
    });
  });

  it("asks for the current PIN when one is set and none is given", async () => {
    fakes.owner.corrections.setPin.mockResolvedValueOnce({ ok: false, triesLeft: 4, lockedUntil: null });
    await expect(setCorrectionPin(ctx, { pin: "135790" })).rejects.toMatchObject({
      status: 400,
      message: "Enter your current PIN to change it",
    });
  });

  it("takes exactly 6 digits, and never echoes the PIN in the error", async () => {
    for (const pin of ["12345", "1234567", "12345a", ""]) {
      const err = await setCorrectionPin(ctx, { pin }).catch((e: unknown) => e);
      expect(err).toMatchObject({ status: 400 });
      if (pin) expect((err as Error).message).not.toContain(pin);
    }
    expect(fakes.owner.corrections.setPin).not.toHaveBeenCalled();
  });
});
