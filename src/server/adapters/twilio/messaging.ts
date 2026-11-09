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
    smsFrom: e.TWILIO_SMS_FROM!,
    whatsappFrom: e.TWILIO_WHATSAPP_FROM!,
  };
}

function client() {
  const { accountSid, authToken } = config();
  return twilioClient(accountSid, authToken);
}

/** Confirm links over WhatsApp and/or SMS (codes are the OtpGateway's: ./otp.ts or 2Factor, A34). */
export const twilioMessaging: Messaging = {
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
