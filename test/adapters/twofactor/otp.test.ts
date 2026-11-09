// The 2Factor adapter (A34) against a stubbed fetch: the URLs it calls, what
// counts as a wrong code, and that no failure carries the number or the key.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { twoFactorOtp, TwoFactorError } from "@/server/adapters/twofactor/otp";

const PHONE = "+919876543210";
const KEY = "test-api-key";

function reply(body: unknown, status = 200) {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  );
}

beforeEach(async () => {
  vi.stubEnv("OTP_PROVIDER", "twofactor");
  vi.stubEnv("TWOFACTOR_API_KEY", KEY);
  vi.stubEnv("TWOFACTOR_OTP_TEMPLATE", "Rent Login");
  (await import("@/server/env")).resetEnvCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("twoFactorOtp", () => {
  it("sends a 6-digit code with AUTOGEN2 and the template, and returns only the session id", async () => {
    const fetchMock = reply({ Status: "Success", Details: "abc-123", OTP: "565059" });
    vi.stubGlobal("fetch", fetchMock);
    expect(await twoFactorOtp.sendOtp(PHONE)).toBe("abc-123");
    expect(fetchMock.mock.calls[0][0]).toBe(`https://2factor.in/API/V1/${KEY}/SMS/+919876543210/AUTOGEN2/Rent%20Login`);
  });

  it("checks the code against the session id", async () => {
    const fetchMock = reply({ Status: "Success", Details: "OTP Matched" });
    vi.stubGlobal("fetch", fetchMock);
    expect(await twoFactorOtp.checkOtp(PHONE, "123456", "abc-123")).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://2factor.in/API/V1/${KEY}/SMS/VERIFY/abc-123/123456`);
  });

  it("reads a mismatched or expired code as a wrong code, and no session as no match", async () => {
    vi.stubGlobal("fetch", reply({ Status: "Error", Details: "OTP Mismatch" }));
    expect(await twoFactorOtp.checkOtp(PHONE, "111111", "abc-123")).toBe(false);
    vi.stubGlobal("fetch", reply({ Status: "Error", Details: "OTP Expired" }, 400));
    expect(await twoFactorOtp.checkOtp(PHONE, "111111", "abc-123")).toBe(false);
    const fetchMock = reply({});
    vi.stubGlobal("fetch", fetchMock);
    expect(await twoFactorOtp.checkOtp(PHONE, "111111", null)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on any other refusal or an unreachable provider, without the number or the key", async () => {
    vi.stubGlobal("fetch", reply({ Status: "Error", Details: `Invalid API key ${KEY} for ${PHONE}` }, 401));
    const refused = await twoFactorOtp.sendOtp(PHONE).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(TwoFactorError);
    expect(String((refused as Error).message)).not.toMatch(/9876543210|test-api-key/);

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(twoFactorOtp.checkOtp(PHONE, "123456", "abc-123")).rejects.toMatchObject({ code: "unreachable" });
  });
});
