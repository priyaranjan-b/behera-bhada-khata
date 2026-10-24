import "server-only";
import twilioClient from "twilio";
import type { Messaging } from "@/server/ports";
import { env, missingTwilioKeys } from "@/server/env";

/** Twilio settings; throws if unset (allowed - callers treat it as "not delivered"). */
function config() {
  const e = env();
  const missing = missingTwilioKeys();
  if (missing.length) throw new Error(`Twilio isn't configured: set ${missing.join(", ")}`);
  return {
    accountSid: e.TWILIO_ACCOUNT_SID!,
    authToken: e.TWILIO_AUTH_TOKEN!,
    verifyServiceSid: e.TWILIO_VERIFY_SERVICE_SID!,
    smsFrom: e.TWILIO_SMS_FROM!,
    whatsappFrom: e.TWILIO_WHATSAPP_FROM!,
  };
}

function client() {
  const { accountSid, authToken } = config();
  return twilioClient(accountSid, authToken);
}

function verifyService() {
  return client().verify.v2.services(config().verifyServiceSid);
}

/** Tenant OTP via Twilio Verify; confirm links over WhatsApp and/or SMS. */
export const twilioMessaging: Messaging = {
  async sendOtp(phoneE164) {
    await verifyService().verifications.create({ to: phoneE164, channel: "sms" });
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

  // Best-effort fan-out to whichever channel(s) the tenant prefers. WhatsApp
  // and SMS sends are independent - one failing (e.g. tenant hasn't opted in
  // to the WhatsApp sender yet) shouldn't block the other.
  async send({ toPhoneE164, channel, message }) {
    const c = client();
    const { whatsappFrom, smsFrom } = config();
    const sends: Promise<unknown>[] = [];

    if (channel === "whatsapp" || channel === "both") {
      sends.push(c.messages.create({ from: whatsappFrom, to: `whatsapp:${toPhoneE164}`, body: message }));
    }
    if (channel === "sms" || channel === "both") {
      sends.push(c.messages.create({ from: smsFrom, to: toPhoneE164, body: message }));
    }

    const results = await Promise.allSettled(sends);
    for (const r of results) {
      if (r.status === "rejected") console.error("Twilio send failed:", (r.reason as Error)?.message ?? r.reason);
    }
    return { delivered: results.some((r) => r.status === "fulfilled") };
  },
};
