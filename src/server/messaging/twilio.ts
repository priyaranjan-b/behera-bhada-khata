import "server-only";
import twilioClient from "twilio";

function client() {
  return twilioClient(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
}

export async function sendOtp(phoneE164: string): Promise<void> {
  await client()
    .verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID!)
    .verifications.create({ to: phoneE164, channel: "sms" });
}

export async function checkOtp(phoneE164: string, code: string): Promise<boolean> {
  const check = await client()
    .verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID!)
    .verificationChecks.create({ to: phoneE164, code });
  return check.status === "approved";
}

export type NotifyChannel = "whatsapp" | "sms" | "both";

// Best-effort fan-out to whichever channel(s) the tenant prefers. WhatsApp and
// SMS sends are independent - one failing (e.g. tenant hasn't opted in to the
// WhatsApp sender yet) shouldn't block the other.
export async function sendConfirmLink(params: {
  toPhoneE164: string;
  channel: NotifyChannel;
  message: string;
}): Promise<{ whatsapp?: "sent" | "failed"; sms?: "sent" | "failed" }> {
  const { toPhoneE164, channel, message } = params;
  const c = client();
  const result: { whatsapp?: "sent" | "failed"; sms?: "sent" | "failed" } = {};

  if (channel === "whatsapp" || channel === "both") {
    try {
      await c.messages.create({
        from: process.env.TWILIO_WHATSAPP_FROM!,
        to: `whatsapp:${toPhoneE164}`,
        body: message,
      });
      result.whatsapp = "sent";
    } catch {
      result.whatsapp = "failed";
    }
  }

  if (channel === "sms" || channel === "both") {
    try {
      await c.messages.create({
        from: process.env.TWILIO_SMS_FROM!,
        to: toPhoneE164,
        body: message,
      });
      result.sms = "sent";
    } catch {
      result.sms = "failed";
    }
  }

  return result;
}
