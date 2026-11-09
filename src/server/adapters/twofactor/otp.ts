import "server-only";
import type { OtpGateway } from "@/server/ports";
import { env } from "@/server/env";

// SMS codes through 2Factor (OTP_PROVIDER=twofactor, A34): an Indian provider
// that registers the DLT OTP template, generates the code and checks it.
//   send:  GET /API/V1/{key}/SMS/{+91XXXXXXXXXX}/AUTOGEN2[/{template}]
//          -> { Status: "Success", Details: "<session id>", OTP: "<code>" }
//          AUTOGEN2 always sends 6 digits (TENANT_PORTAL_LIMITS.otpLength);
//          plain AUTOGEN's length varies. The OTP in the reply is ignored and
//          never logged: the code is checked by 2Factor (VERIFY).
//   check: GET /API/V1/{key}/SMS/VERIFY/{session id}/{code}
//          -> { Status: "Success", Details: "OTP Matched" }
//          or { Status: "Error", Details: "OTP Mismatch" | "OTP Expired" }
// (as in 2Factor's API docs: documenter.getpostman.com/view/301893/TWDamFGh).
// Errors never carry the phone, the code or the API key: they are logged.

const BASE_URL = "https://2factor.in/API/V1";
/** A provider that doesn't answer fails the send in time, rather than holding the request. */
const TIMEOUT_MS = 8000;

/** A 2Factor failure; `code` / `status` for the log, never the request. */
export class TwoFactorError extends Error {
  constructor(
    readonly code: string,
    readonly status: number
  ) {
    super(`2Factor request failed (${code}, HTTP ${status})`);
    this.name = "TwoFactorError";
  }
}

interface TwoFactorReply {
  Status?: string;
  Details?: string;
}

function apiKey(): string {
  const key = env().TWOFACTOR_API_KEY;
  if (!key) throw new TwoFactorError("not_configured", 0);
  return key;
}

async function call(path: string): Promise<{ status: number; reply: TwoFactorReply | null }> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${encodeURIComponent(apiKey())}/SMS/${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new TwoFactorError(err instanceof Error && err.name === "TimeoutError" ? "timeout" : "unreachable", 0);
  }
  const reply = (await res.json().catch(() => null)) as TwoFactorReply | null;
  return { status: res.status, reply };
}

/**
 * The phone as 2Factor's docs write it: E.164 with a literal "+" (an encoded
 * %2B isn't what their examples send). Only "+" and digits reach here
 * (phoneE164Schema), so nothing else needs escaping.
 */
const phonePath = (phoneE164: string) => {
  if (!/^\+[1-9]\d{7,14}$/.test(phoneE164)) throw new TwoFactorError("bad_phone", 0);
  return phoneE164;
};

/** A wrong or expired code reads "OTP Mismatch" / "OTP Expired": the tenant's mistake, not a failure. */
const isCodeRejection = (reply: TwoFactorReply | null) =>
  reply?.Status === "Error" && /otp\s*(mismatch|expired)|invalid\s*otp/i.test(reply.Details ?? "");

export const twoFactorOtp: OtpGateway = {
  async sendOtp(phoneE164) {
    const template = env().TWOFACTOR_OTP_TEMPLATE;
    const path = `${phonePath(phoneE164)}/AUTOGEN2${template ? `/${encodeURIComponent(template)}` : ""}`;
    const { status, reply } = await call(path);
    if (reply?.Status !== "Success" || !reply.Details) throw new TwoFactorError("send_refused", status);
    return reply.Details;
  },

  async checkOtp(_phoneE164, code, reference) {
    // No reference: no code was sent (or it expired here) - nothing to match.
    if (!reference) return false;
    const { status, reply } = await call(`VERIFY/${encodeURIComponent(reference)}/${encodeURIComponent(code)}`);
    if (reply?.Status === "Success") return true;
    if (isCodeRejection(reply)) return false;
    throw new TwoFactorError("check_refused", status);
  },
};
