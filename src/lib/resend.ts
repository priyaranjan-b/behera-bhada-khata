import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { generateConfirmToken } from "@/lib/token";
import { sendConfirmLink } from "@/lib/messaging/twilio";
import { formatMoney } from "@/lib/money";

// Rotates the share link for a pending payment/adjustment and resends it.
// The underlying UPDATE is restricted to token_hash/token_expires_at by a
// column-level grant (see supabase/migrations/0001_init.sql), so this can
// never touch the ledger's financial facts.
export async function resendConfirmLink(params: {
  supabase: SupabaseClient<Database>;
  table: "payments" | "adjustments";
  recordId: string;
  tenantId: string;
  amount: number;
  label: string;
}): Promise<{ error?: string }> {
  const { supabase, table, recordId, tenantId, amount, label } = params;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, phone, preferred_channel")
    .eq("id", tenantId)
    .single();
  if (!tenant) return { error: "Tenant not found" };

  const { token, tokenHash, expiresAt } = generateConfirmToken();

  const { error } = await supabase
    .from(table)
    .update({ token_hash: tokenHash, token_expires_at: expiresAt })
    .eq("id", recordId)
    .eq("status", "pending");
  if (error) return { error: error.message };

  const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL}/confirm/${token}`;
  const message = `Hi ${tenant.name}, reminder to confirm the ${label} of ${formatMoney(amount)}: ${confirmUrl}`;
  await sendConfirmLink({ toPhoneE164: tenant.phone, channel: tenant.preferred_channel, message });

  return {};
}
