import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";
import { PNG_DATA_URL, fakes, payment, resetFakes, withoutTwilio } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());
vi.mock("@/server/pdf/receipt", () => ({ generateReceiptPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

const { generateReceiptPdf } = await import("@/server/pdf/receipt");
const { confirmRecord, confirmReceiptUrl, getConfirmView, sendConfirmOtp } = await import("@/server/services/confirm");

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
    expect(id).toBe("00000000-0000-4000-8000-000000000201");
    const folder = patch.pdf_path.replace(/\/receipt\.pdf$/, "");
    expect(patch.tenant_signature_path).toBe(`${folder}/tenant-signature.png`);
    expect([...fakes.state.files.keys()].sort()).toEqual([patch.pdf_path, patch.tenant_signature_path].sort());
    expect(result.receiptUrl).toContain(patch.pdf_path);
    // The owner's real name goes on the receipt.
    expect(vi.mocked(generateReceiptPdf).mock.calls[0][0]).toMatchObject({
      ownerName: "Ramesh Sahu",
      signatureName: "Anil Sahu",
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

  it("keeps its files when the reply was lost after the acknowledgement committed", async () => {
    // The database wrote it (the record now points at this attempt's receipt), then the connection dropped.
    fakes.system.payments.acknowledge.mockImplementationOnce(async (...args: unknown[]) => {
      const [id, patch] = args as [string, { pdf_path: string; tenant_signature_path: string }];
      const record = fakes.state.payments.get(id)!;
      fakes.state.payments.set(id, { ...record, ...patch, acknowledged_at: "2026-03-06T00:00:00Z" });
      throw new Error("acknowledge payment: [?] connection closed");
    });
    await expect(confirmRecord("token", body, meta)).rejects.toThrow("connection closed");
    expect(fakes.state.files.size).toBe(2);
  });

  it("still cleans up when an unexpected failure left the record unacknowledged", async () => {
    fakes.system.payments.acknowledge.mockRejectedValueOnce(new Error("acknowledge payment: [?] connection refused"));
    await expect(confirmRecord("token", body, meta)).rejects.toThrow("connection refused");
    expect(fakes.state.files.size).toBe(0);
  });

  it("checks the OTP before storing anything", async () => {
    fakes.otp.checkOtp.mockResolvedValueOnce(false);
    expect(await status(confirmRecord("token", body, meta))).toBe(400);
    expect(fakes.storage.upload).not.toHaveBeenCalled();
  });

  it("rejects a signature that isn't really a PNG", async () => {
    const fake = `data:image/png;base64,${Buffer.from("<svg onload=alert(1)>").toString("base64")}`;
    expect(await status(confirmRecord("token", { ...body, tenantSignaturePng: fake }, meta))).toBe(400);
    expect(fakes.otp.checkOtp).not.toHaveBeenCalled();
  });

  it("refuses records that are already acknowledged or whose link expired", async () => {
    fakes.state.payments.set("00000000-0000-4000-8000-000000000201", payment({ acknowledged_at: "2026-03-06T00:00:00Z" }));
    expect(await status(confirmRecord("token", body, meta))).toBe(409);
    fakes.state.payments.set("00000000-0000-4000-8000-000000000201", payment({ token_expires_at: "2020-01-01T00:00:00Z" }));
    expect(await status(confirmRecord("token", body, meta))).toBe(410);
  });
});

describe("sendConfirmOtp", () => {
  it("rate-limits per record, per client and per phone per day before sending a paid SMS", async () => {
    await sendConfirmOtp("token", { recordType: "payment" }, meta);
    const keys = (fakes.system.rateLimits.hit.mock.calls as unknown as [string][]).map((c) => c[0]);
    expect(keys.map((k) => k.replace(/:[0-9a-f]{24}$/, ":<hash>"))).toEqual([
      "otp:record:00000000-0000-4000-8000-000000000201",
      "otp:ip:203.0.113.7",
      "otp-day:phone:<hash>",
    ]);
    expect(fakes.otp.sendOtp).toHaveBeenCalledWith("+919876543210");

    fakes.state.rateLimitAllows = false;
    fakes.otp.sendOtp.mockClear();
    expect(await status(sendConfirmOtp("token", { recordType: "payment" }, meta))).toBe(429);
    expect(fakes.otp.sendOtp).not.toHaveBeenCalled();
  });
});

describe("the daily budget of codes per phone", () => {
  it("is shared with tenant sign-in: the same key for the same number", async () => {
    const { sendTenantOtp } = await import("@/server/services/tenantAuth");
    await sendConfirmOtp("token", { recordType: "payment" }, meta);
    await sendTenantOtp({ phone: "+919876543210" }, meta);
    const daily = (fakes.system.rateLimits.hit.mock.calls as unknown as [string][])
      .map((c) => c[0])
      .filter((k) => k.startsWith("otp-day:phone:"));
    expect(daily).toHaveLength(2);
    expect(daily[0]).toBe(daily[1]);
  });
});

describe("without Twilio", () => {
  it("tells the confirm page, and refuses an OTP before spending a rate-limit hit", async () => {
    expect(await getConfirmView("token")).toMatchObject({ isExpired: false, tenantMessaging: true });
    await withoutTwilio();
    expect(await getConfirmView("token")).toMatchObject({ isExpired: false, tenantMessaging: false });
    expect(await status(sendConfirmOtp("token", { recordType: "payment" }, meta))).toBe(503);
    expect(fakes.system.rateLimits.hit).not.toHaveBeenCalled();
    expect(fakes.otp.sendOtp).not.toHaveBeenCalled();
  });
});

// S1 (docs/tech-debt.md): an old link mustn't keep showing the tenant's details or serving the signed receipt.
describe("an old or expired link", () => {
  const id = "00000000-0000-4000-8000-000000000201";
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  const acknowledged = (days: number) =>
    payment({ acknowledged_at: daysAgo(days), pdf_path: `payments/x/${id}/a/receipt.pdf` });

  it("shows only that it expired, none of the tenant's details, once the unacknowledged link is past its expiry", async () => {
    fakes.state.payments.set(id, payment({ token_expires_at: "2020-01-01T00:00:00Z" }));
    expect(await getConfirmView("token")).toEqual({ recordType: "payment", isExpired: true });
  });

  it("keeps the signed receipt for 14 days after the tenant acknowledges", async () => {
    fakes.state.payments.set(id, acknowledged(3));
    expect(await getConfirmView("token")).toMatchObject({ isExpired: false, acknowledged: true });
    expect(await confirmReceiptUrl("token", "payment")).toContain("receipt.pdf");
  });

  it("stops serving the details and the signed receipt after that", async () => {
    fakes.state.payments.set(id, acknowledged(15));
    expect(await getConfirmView("token")).toEqual({ recordType: "payment", isExpired: true });
    expect(await status(confirmReceiptUrl("token", "payment"))).toBe(410);
    expect(fakes.storage.signedUrl).not.toHaveBeenCalled();
  });
});
