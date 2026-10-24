import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_ID, PNG_DATA_URL, fakes, resetFakes, tenant } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { getOwnerProfile, updateOwnerProfile } = await import("@/server/services/profile");
const { createPayment, getNewPaymentForm } = await import("@/server/services/payments");

const ctx = { ownerId: OWNER_ID, email: "owner@example.com" };
const names = { firstName: " Ramesh ", lastName: "Sahu", signatureName: "Anil Sahu" };

beforeEach(() => {
  resetFakes();
});

describe("owner profile", () => {
  it("is empty until saved, then shows the owner's name", async () => {
    expect(await getOwnerProfile(ctx)).toMatchObject({ displayName: null, email: "owner@example.com", signatureUrl: null });

    await updateOwnerProfile(ctx, names);
    expect(await getOwnerProfile(ctx)).toMatchObject({
      firstName: "Ramesh",
      lastName: "Sahu",
      signatureName: "Anil Sahu",
      displayName: "Ramesh Sahu",
    });
  });

  it("stores empty optional names as null, and needs a first name", async () => {
    await updateOwnerProfile(ctx, { firstName: "Ramesh", lastName: "  ", signatureName: "" });
    expect(fakes.state.profile).toMatchObject({ last_name: null, signature_name: null });
    await expect(updateOwnerProfile(ctx, { firstName: " " })).rejects.toMatchObject({ status: 400 });
  });

  it("replaces the saved signature and deletes the old file", async () => {
    await updateOwnerProfile(ctx, { ...names, signaturePng: PNG_DATA_URL });
    const first = fakes.state.profile!.signature_path!;
    expect(first).toMatch(/^owner\/signature-[\w-]+\.png$/);
    expect((await getOwnerProfile(ctx)).signatureUrl).toContain(first);

    await updateOwnerProfile(ctx, { ...names, signaturePng: PNG_DATA_URL });
    expect(fakes.state.profile!.signature_path).not.toBe(first);
    expect(fakes.storage.remove).toHaveBeenCalledWith([first]);

    await updateOwnerProfile(ctx, { ...names, removeSignature: true });
    expect(fakes.state.profile!.signature_path).toBeNull();
  });
});

describe("recording with the saved signature", () => {
  const tenantId = "7f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f";
  const body = {
    amount: 5000,
    paymentDate: "2026-03-05",
    mode: "upi",
    allocations: [{ rentPeriodId: "6f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f", amountAllocated: 5000 }],
    notifyTenant: false,
  };

  beforeEach(() => {
    fakes.state.tenants.set(tenantId, tenant({ id: tenantId }));
  });

  it("copies the saved signature onto the payment when none is drawn", async () => {
    await updateOwnerProfile(ctx, { ...names, signaturePng: PNG_DATA_URL });
    const saved = fakes.state.profile!.signature_path!;

    const { id } = await createPayment(ctx, tenantId, body);
    expect(fakes.storage.download).toHaveBeenCalledWith(saved);
    expect(fakes.state.files.has(`payments/${tenantId}/${id}/owner-signature.png`)).toBe(true);
    expect((await getNewPaymentForm(ctx, tenantId)).savedSignature).toMatchObject({ signerName: "Anil Sahu" });
  });

  it("asks for a signature when none is drawn or saved", async () => {
    await expect(createPayment(ctx, tenantId, body)).rejects.toMatchObject({ status: 400 });
    expect(fakes.owner.payments.create).not.toHaveBeenCalled();
    expect((await getNewPaymentForm(ctx, tenantId)).savedSignature).toBeNull();
  });
});
