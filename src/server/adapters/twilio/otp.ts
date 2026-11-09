import "server-only";
import twilioClient from "twilio";
import type { OtpGateway } from "@/server/ports";
import { env } from "@/server/env";

/** The Verify service; throws if unset (otpEnabled() is checked before any send). */
function verifyService() {
  const e = env();
  if (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN || !e.TWILIO_VERIFY_SERVICE_SID) {
    throw new Error("Twilio Verify isn't configured");
  }
  return twilioClient(e.TWILIO_ACCOUNT_SID, e.TWILIO_AUTH_TOKEN).verify.v2.services(e.TWILIO_VERIFY_SERVICE_SID);
}

/** SMS codes through Twilio Verify (OTP_PROVIDER=twilio): checked by phone number, so no reference. */
export const twilioOtp: OtpGateway = {
  async sendOtp(phoneE164) {
    await verifyService().verifications.create({ to: phoneE164, channel: "sms" });
    return null;
  },

  async checkOtp(phoneE164, code) {
    try {
      const check = await verifyService().verificationChecks.create({ to: phoneE164, code });
      return check.status === "approved";
    } catch (err) {
      // Verify answers 404 once a verification is approved, expired or out of
      // attempts - to the tenant that's just "wrong or expired code".
      if ((err as { status?: number }).status === 404) return false;
      throw err;
    }
  },
};
