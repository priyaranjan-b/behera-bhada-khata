import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { OWNER_ID, PNG_DATA_URL, fakes, payment, resetFakes, tenant, withoutTwilio } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

vi.mock("@/server/pdf/receipt", () => ({ generateReceiptPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

const { generateReceiptPdf } = await import("@/server/pdf/receipt");
const { createPayment, getNewPaymentForm, paymentProofUrl, paymentReceipt, resendPaymentLink } = await import(
  "@/server/services/payments"
);
const { getTenantDetail } = await import("@/server/services/tenants");
const { adjustmentReceipt } = await import("@/server/services/adjustments");

const ctx = { ownerId: OWNER_ID };

beforeEach(() => {
  resetFakes();
});

describe("resendPaymentLink", () => {
  it("texts the payment's own tenant with the recorded amount", async () => {
    fakes.state.tenants.set("00000000-0000-4000-8000-000000000102", tenant({ id: "00000000-0000-4000-8000-000000000102", phone: "+919999999999" }));

    const result = await resendPaymentLink(ctx, "00000000-0000-4000-8000-000000000201");

    expect(result).toEqual({ notified: true });
    const [[sent]] = fakes.messaging.send.mock.calls as unknown as [[{ toPhoneE164: string; message: string }]];
    expect(sent.toPhoneE164).toBe("+919876543210");
    expect(sent.message).toContain("₹5,000.00");
    expect(sent.message).toMatch(/https:\/\/rent\.test\/confirm\/[\w-]{20,}/);
  });

  it("refuses payments the tenant already acknowledged, without sending anything", async () => {
    fakes.state.payments.set("00000000-0000-4000-8000-000000000201", payment({ acknowledged_at: "2026-03-06T00:00:00Z" }));
    await expect(resendPaymentLink(ctx, "00000000-0000-4000-8000-000000000201")).rejects.toMatchObject({ status: 409 });
    expect(fakes.messaging.send).not.toHaveBeenCalled();
  });

  it("refuses if the token can't be rotated (confirmed in the meantime)", async () => {
    fakes.owner.payments.rotateToken.mockResolvedValueOnce(false);
    await expect(resendPaymentLink(ctx, "00000000-0000-4000-8000-000000000201")).rejects.toMatchObject({ status: 409 });
    expect(fakes.messaging.send).not.toHaveBeenCalled();
  });

  it("reports when no channel delivered the message", async () => {
    fakes.messaging.send.mockResolvedValueOnce({ delivered: false });
    expect(await resendPaymentLink(ctx, "00000000-0000-4000-8000-000000000201")).toEqual({ notified: false });
  });
});

describe("createPayment", () => {
  const body = {
    amount: 5000,
    paymentDate: "2026-03-05",
    mode: "upi",
    allocations: [{ rentPeriodId: "6f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f", amountAllocated: 5000 }],
    ownerSignaturePng: PNG_DATA_URL,
  };
  const tenantId = "7f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f";

  beforeEach(() => {
    fakes.state.tenants.set(tenantId, tenant({ id: tenantId }));
  });

  it("removes the uploaded signature when the database rejects the payment", async () => {
    fakes.owner.payments.create.mockRejectedValueOnce(new ApiError(400, "The months add up to 4000.00"));
    await expect(createPayment(ctx, tenantId, body)).rejects.toMatchObject({ status: 400 });
    expect(fakes.state.files.size).toBe(0);
    expect(fakes.messaging.send).not.toHaveBeenCalled();
  });

  it("passes allocations through for the database to check", async () => {
    const result = await createPayment(ctx, tenantId, body);
    expect(result.notified).toBe(true);
    const [[, allocations]] = fakes.owner.payments.create.mock.calls as unknown as [[unknown, unknown]];
    expect(allocations).toEqual([{ rent_period_id: body.allocations[0].rentPeriodId, amount: 5000 }]);
    expect(fakes.state.files.size).toBe(1);
  });

  describe("with proof files", () => {
    const jpeg = (name = "UPI screenshot.JPG") => ({ name, bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) });
    const pdf = { name: "bank slip.pdf", bytes: new TextEncoder().encode("%PDF-1.7 ...") };

    it("uploads them under the payment's folder and records them with the payment", async () => {
      await createPayment(ctx, tenantId, body, [jpeg(), pdf]);

      const [[payment, , proofs]] = fakes.owner.payments.create.mock.calls as unknown as [
        [{ id: string }, unknown, { storage_path: string; file_name: string; content_type: string; size_bytes: number }[]],
      ];
      const folder = `payments/${tenantId}/${payment.id}/proofs`;
      expect(proofs).toEqual([
        { storage_path: `${folder}/1-upi-screenshot.jpg`, file_name: "UPI screenshot.JPG", content_type: "image/jpeg", size_bytes: 7 },
        { storage_path: `${folder}/2-bank-slip.pdf`, file_name: "bank slip.pdf", content_type: "application/pdf", size_bytes: pdf.bytes.length },
      ]);
      expect([...fakes.state.files.keys()]).toEqual(
        expect.arrayContaining([`${folder}/1-upi-screenshot.jpg`, `${folder}/2-bank-slip.pdf`])
      );
    });

    it("trusts the bytes, not the name: rejects a non-image before uploading anything", async () => {
      const fake = { name: "proof.jpg", bytes: new TextEncoder().encode("<html>") };
      await expect(createPayment(ctx, tenantId, body, [fake])).rejects.toMatchObject({ status: 400 });
      expect(fakes.state.files.size).toBe(0);
      expect(fakes.owner.payments.create).not.toHaveBeenCalled();
    });

    it("rejects too many files", async () => {
      const six = Array.from({ length: 6 }, (_, i) => jpeg(`${i}.jpg`));
      await expect(createPayment(ctx, tenantId, body, six)).rejects.toMatchObject({ status: 400 });
      expect(fakes.state.files.size).toBe(0);
    });

    it("rejects more than 4 MB in total", async () => {
      const big = { name: "big.pdf", bytes: new Uint8Array(4 * 1024 * 1024 + 1) };
      big.bytes.set(new TextEncoder().encode("%PDF-"));
      await expect(createPayment(ctx, tenantId, body, [big])).rejects.toMatchObject({ status: 400 });
    });

    it("removes the signature and every proof when the database rejects the payment", async () => {
      fakes.owner.payments.create.mockRejectedValueOnce(new ApiError(400, "The months add up to 4000.00"));
      await expect(createPayment(ctx, tenantId, body, [jpeg(), pdf])).rejects.toMatchObject({ status: 400 });
      expect(fakes.state.files.size).toBe(0);
      expect(fakes.messaging.send).not.toHaveBeenCalled();
    });

    it("removes what was uploaded if a proof upload fails midway", async () => {
      fakes.storage.upload.mockImplementationOnce(async (path, bytes) => {
        fakes.state.files.set(path, bytes); // the signature
      });
      fakes.storage.upload.mockImplementationOnce(async (path, bytes) => {
        fakes.state.files.set(path, bytes); // first proof
      });
      fakes.storage.upload.mockRejectedValueOnce(new Error("network"));
      await expect(createPayment(ctx, tenantId, body, [jpeg(), pdf])).rejects.toMatchObject({ status: 500 });
      expect(fakes.state.files.size).toBe(0);
      expect(fakes.owner.payments.create).not.toHaveBeenCalled();
    });
  });
});

describe("viewing proofs", () => {
  const PROOF_ID = "9b2f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

  beforeEach(() => {
    fakes.state.proofs.set(PROOF_ID, {
      id: PROOF_ID,
      payment_id: "00000000-0000-4000-8000-000000000201",
      storage_path: "payments/00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/proofs/1-upi.jpg",
      file_name: "UPI.jpg",
      content_type: "image/jpeg",
      size_bytes: 1234,
      created_at: "",
    });
  });

  it("lists a payment's proofs on its ledger row", async () => {
    const { ledger } = await getTenantDetail(ctx, "00000000-0000-4000-8000-000000000101");
    const row = ledger.find((r) => r.refId === "00000000-0000-4000-8000-000000000201");
    expect(row?.proofs).toEqual([{ id: PROOF_ID, fileName: "UPI.jpg", contentType: "image/jpeg" }]);
  });

  it("signs a short-lived URL for the file", async () => {
    const url = await paymentProofUrl(ctx, "00000000-0000-4000-8000-000000000201", PROOF_ID);
    expect(url).toBe("https://storage.test/payments/00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/proofs/1-upi.jpg?sig");
    expect(fakes.storage.signedUrl).toHaveBeenCalledWith(expect.any(String), 300);
  });

  it.each([
    ["belongs to another payment", "00000000-0000-4000-8000-000000000202", PROOF_ID],
    ["doesn't exist", "00000000-0000-4000-8000-000000000201", "0b2f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"],
    ["is not a uuid", "00000000-0000-4000-8000-000000000201", "../../receipt"],
  ])("404s for a proof that %s", async (_label, paymentId, proofId) => {
    await expect(paymentProofUrl(ctx, paymentId, proofId)).rejects.toMatchObject({ status: 404 });
    expect(fakes.storage.signedUrl).not.toHaveBeenCalled();
  });
});

describe("instant confirmation (0010)", () => {
  const tenantId = "7f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f";
  const body = {
    amount: 5000,
    paymentDate: "2026-03-05",
    mode: "upi",
    allocations: [{ rentPeriodId: "6f1c0d3e-2b1a-4c5d-8e9f-0a1b2c3d4e5f", amountAllocated: 5000 }],
    ownerSignaturePng: PNG_DATA_URL,
  };

  beforeEach(() => {
    fakes.state.tenants.set(tenantId, tenant({ id: tenantId }));
    vi.mocked(generateReceiptPdf).mockClear();
  });

  it("messages the tenant by default, with a link to acknowledge", async () => {
    expect((await createPayment(ctx, tenantId, body)).notified).toBe(true);
    const [[sent]] = fakes.messaging.send.mock.calls as unknown as [[{ message: string }]];
    expect(sent.message).toMatch(/acknowledge/i);
  });

  it("without Twilio, tells the forms and the ledger, and never tries to send", async () => {
    expect((await getNewPaymentForm(ctx, tenantId)).tenantMessaging).toBe(true);
    await withoutTwilio();
    expect((await getNewPaymentForm(ctx, tenantId)).tenantMessaging).toBe(false);
    expect((await getTenantDetail(ctx, tenantId)).tenantMessaging).toBe(false);
    expect((await createPayment(ctx, tenantId, body)).notified).toBe(false);
    expect(fakes.messaging.send).not.toHaveBeenCalled();
    expect(fakes.owner.payments.create).toHaveBeenCalled();
  });

  it("sends nothing when the owner unticks it (notified: null)", async () => {
    expect((await createPayment(ctx, tenantId, { ...body, notifyTenant: false })).notified).toBeNull();
    expect(fakes.messaging.send).not.toHaveBeenCalled();
    expect(fakes.owner.payments.create).toHaveBeenCalled();
  });

  it("renders the owner's receipt on demand, before the tenant signs", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const row = payment({ id });
    fakes.state.payments.set(id, row);
    fakes.state.files.set(row.owner_signature_path!, new Uint8Array([1]));

    const file = await paymentReceipt(ctx, id);
    expect(file.fileName).toBe("receipt-2026-03-001.pdf");
    expect(vi.mocked(generateReceiptPdf).mock.calls[0][0]).toMatchObject({ totalAmount: 5000, tenantSignaturePng: undefined });
  });

  it("prints the receipt number and appends the proofs, leaving out one that can't be downloaded", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    fakes.state.payments.set(id, payment({ id }));
    for (const [n, name] of ["upi.webp", "gone.jpg"].entries()) {
      fakes.state.proofs.set(`proof-${n}`, {
        id: `proof-${n}`,
        payment_id: id,
        storage_path: `payments/00000000-0000-4000-8000-000000000101/${id}/proofs/${name}`,
        file_name: name,
        content_type: name.endsWith(".webp") ? "image/webp" : "image/jpeg",
        size_bytes: 10,
        created_at: "",
      });
    }
    fakes.storage.download.mockImplementation(async (path: string) => {
      if (path.endsWith("gone.jpg")) throw new Error("not found");
      return new Uint8Array([1]);
    });

    await paymentReceipt(ctx, id);
    const input = vi.mocked(generateReceiptPdf).mock.calls[0][0];
    expect(input).toMatchObject({ kind: "payment", receiptNo: "2026/03/001", correctsReceiptNo: null });
    expect(input.propertyName).toBe("Arnapal Chakk Complex, Tower 1");
    expect(input.proofs).toEqual([{ fileName: "upi.webp", contentType: "image/webp", bytes: new Uint8Array([1]) }]);
  });

  it("names the payment an adjustment corrects", async () => {
    const id = "00000000-0000-4000-8000-000000000004";
    fakes.state.adjustments.set(id, {
      ...payment({ id }),
      original_payment_id: "00000000-0000-4000-8000-000000000201",
      delta_amount: "-500.00",
      reason: "Recorded too much",
      receipt_no: "ADJ/2026/03/001",
    });

    const file = await adjustmentReceipt(ctx, id);
    expect(file.fileName).toBe("adjustment-ADJ-2026-03-001.pdf");
    expect(vi.mocked(generateReceiptPdf).mock.calls[0][0]).toMatchObject({
      kind: "adjustment",
      receiptNo: "ADJ/2026/03/001",
      correctsReceiptNo: "2026/03/001",
      proofs: [],
    });
  });

  it("serves the tenant-signed copy once they've acknowledged", async () => {
    const id = "00000000-0000-4000-8000-000000000002";
    fakes.state.payments.set(id, payment({ id, acknowledged_at: "2026-03-06T00:00:00Z", pdf_path: "signed.pdf" }));

    await paymentReceipt(ctx, id);
    expect(fakes.storage.download).toHaveBeenCalledWith("signed.pdf");
    expect(generateReceiptPdf).not.toHaveBeenCalled();
  });

  it("404s for an unknown or malformed id", async () => {
    await expect(paymentReceipt(ctx, "00000000-0000-4000-8000-000000000003")).rejects.toMatchObject({ status: 404 });
    await expect(paymentReceipt(ctx, "../x")).rejects.toMatchObject({ status: 404 });
  });
});
