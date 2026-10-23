import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { PNG_DATA_URL, fakes, payment, resetFakes } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());
vi.mock("@/server/pdf/receipt", () => ({ generateReceiptPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

const { generateReceiptPdf } = await import("@/server/pdf/receipt");
const { confirmRecord, sendConfirmOtp } = await import("@/server/services/confirm");

const meta = { ip: "203.0.113.7" };
const body = { recordType: "payment", otpCode: "123456", tenantSignaturePng: PNG_DATA_URL };

async function status(run: Promise<unknown>): Promise<number | "ok"> {
  try {
    await run;
    return "ok";
  } catch (err) {
    if (err instanceof ApiError) return err.status;
    throw err;
  }
}

beforeEach(() => {
  resetFakes();
  vi.mocked(generateReceiptPdf).mockClear();
});

describe("confirmRecord", () => {
  it("renders the tenant-signed receipt, stores both files under one attempt folder, then acknowledges", async () => {
    const result = await confirmRecord("token", body, meta);

    const [[id, patch]] = fakes.system.payments.acknowledge.mock.calls as unknown as [[string, { pdf_path: string; tenant_signature_path: string }]];
    expect(id).toBe("payment-1");
    const folder = patch.pdf_path.replace(/\/receipt\.pdf$/, "");
    expect(patch.tenant_signature_path).toBe(`${folder}/tenant-signature.png`);
    expect([...fakes.state.files.keys()].sort()).toEqual([patch.pdf_path, patch.tenant_signature_path].sort());
    expect(result.receiptUrl).toContain(patch.pdf_path);
    // The owner's real name goes on the receipt.
    expect(vi.mocked(generateReceiptPdf).mock.calls[0][0]).toMatchObject({
      ownerName: "Priyaranjan",
      totalAmount: 5000,
      tenantSignaturePng: expect.any(Uint8Array),
      otpVerifiedAt: expect.any(String),
    });
  });

  it("writes nothing when the receipt can't be rendered, so the tenant can simply retry", async () => {
    vi.mocked(generateReceiptPdf).mockRejectedValueOnce(new Error("font missing"));
    await expect(confirmRecord("token", body, meta)).rejects.toThrow("font missing");
    expect(fakes.state.files.size).toBe(0);
    expect(fakes.system.payments.acknowledge).not.toHaveBeenCalled();

    expect(await status(confirmRecord("token", body, meta))).toBe("ok");
  });

  it("cleans up its files when a racing acknowledgement won", async () => {
    fakes.system.payments.acknowledge.mockResolvedValueOnce(false);
    expect(await status(confirmRecord("token", body, meta))).toBe(409);
    expect(fakes.state.files.size).toBe(0);
  });

  it("cleans up its files when the database write fails", async () => {
    fakes.system.payments.acknowledge.mockRejectedValueOnce(new ApiError(500, "Something went wrong"));
    expect(await status(confirmRecord("token", body, meta))).toBe(500);
    expect(fakes.state.files.size).toBe(0);
  });

  it("checks the OTP before storing anything", async () => {
    fakes.messaging.checkOtp.mockResolvedValueOnce(false);
    expect(await status(confirmRecord("token", body, meta))).toBe(400);
    expect(fakes.storage.upload).not.toHaveBeenCalled();
  });

  it("rejects a signature that isn't really a PNG", async () => {
    const fake = `data:image/png;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`;
    expect(await status(confirmRecord("token", { ...body, tenantSignaturePng: fake }, meta))).toBe(400);
    expect(fakes.messaging.checkOtp).not.toHaveBeenCalled();
  });

  it("refuses records that are already acknowledged or whose link expired", async () => {
    fakes.state.payments.set("payment-1", payment({ acknowledged_at: "2026-03-06T00:00:00Z" }));
    expect(await status(confirmRecord("token", body, meta))).toBe(409);
    fakes.state.payments.set("payment-1", payment({ token_expires_at: "2020-01-01T00:00:00Z" }));
    expect(await status(confirmRecord("token", body, meta))).toBe(410);
  });
});

describe("sendConfirmOtp", () => {
  it("rate-limits per record and per client before sending a paid SMS", async () => {
    await sendConfirmOtp("token", { recordType: "payment" }, meta);
    const keys = (fakes.system.rateLimits.hit.mock.calls as unknown as [string][]).map((c) => c[0]);
    expect(keys).toEqual(["otp:record:payment-1", "otp:ip:203.0.113.7"]);
    expect(fakes.messaging.sendOtp).toHaveBeenCalledWith("+919876543210");

    fakes.state.rateLimitAllows = false;
    fakes.messaging.sendOtp.mockClear();
    expect(await status(sendConfirmOtp("token", { recordType: "payment" }, meta))).toBe(429);
    expect(fakes.messaging.sendOtp).not.toHaveBeenCalled();
  });
});
