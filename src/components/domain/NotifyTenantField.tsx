"use client";

import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import type { Flash } from "@/lib/routes";

/**
 * "Ask the tenant to acknowledge" for the payment and adjustment forms. The
 * record counts as soon as it's saved either way (0010); this only decides
 * whether the tenant is messaged a link to sign and get their own copy.
 * Without Twilio (`available` false) it's a note instead of a checkbox.
 */
export default function NotifyTenantField({
  checked,
  onChange,
  disabled = false,
  available,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Tenant messaging is set up (the API's `tenantMessaging`). */
  available: boolean;
}) {
  if (!available) {
    return (
      <Alert severity="info">
        Tenant messaging isn&apos;t set up yet. It counts as soon as you save; download the receipt and send it to the
        tenant yourself.
      </Alert>
    );
  }
  return (
    <Stack spacing={0}>
      <FormControlLabel
        control={<Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />}
        label="Send the tenant a WhatsApp/SMS link to acknowledge it"
      />
      <FormHelperText sx={{ mt: 0, ml: 4 }}>
        Optional. It counts as soon as you save; you can also download the receipt and send it yourself.
      </FormHelperText>
    </Stack>
  );
}

/** The tenant page's flash param after saving, from the API's `notified` (null = not asked). */
export function recordedFlash(notified: boolean | null): Flash {
  if (notified === null) return { paymentCreated: "1" };
  return notified ? { paymentCreated: "sent" } : { notifyFailed: "1" };
}
