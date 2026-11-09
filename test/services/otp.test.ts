// Sending and checking SMS codes (A34): a provider that hands back a
// reference (2Factor's session id) gets it again at the check, from the
// shared store, and a match uses it up.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakes, resetFakes } from "../fakes";

vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());

const { codeMatches, sendCode } = await import("@/server/services/otp");

const PHONE = "+919876543210";

beforeEach(() => {
  resetFakes();
});

describe("SMS codes through the OTP provider", () => {
  it("keeps a provider's reference, keyed without the number, and checks the code against it", async () => {
    fakes.otp.sendOtp.mockResolvedValueOnce("session-1");
    await sendCode(PHONE);
    const [[key, reference]] = fakes.system.otpSessions.save.mock.calls as unknown as [string, string][];
    expect(reference).toBe("session-1");
    expect(key).not.toContain("9876543210");

    expect(await codeMatches(PHONE, "123456")).toBe(true);
    expect(fakes.otp.checkOtp).toHaveBeenCalledWith(PHONE, "123456", "session-1");
    // Used up: the same code can't sign in twice.
    expect(fakes.state.otpSessions.size).toBe(0);
  });

  it("keeps the reference after a wrong code, so the right one still works", async () => {
    fakes.otp.sendOtp.mockResolvedValueOnce("session-1");
    await sendCode(PHONE);
    fakes.otp.checkOtp.mockResolvedValueOnce(false);
    expect(await codeMatches(PHONE, "000001")).toBe(false);
    expect(fakes.state.otpSessions.size).toBe(1);
  });

  it("stores nothing for a provider that checks by phone (Twilio Verify)", async () => {
    await sendCode(PHONE);
    expect(fakes.system.otpSessions.save).not.toHaveBeenCalled();
    expect(await codeMatches(PHONE, "123456")).toBe(true);
    expect(fakes.otp.checkOtp).toHaveBeenCalledWith(PHONE, "123456", null);
  });
});
