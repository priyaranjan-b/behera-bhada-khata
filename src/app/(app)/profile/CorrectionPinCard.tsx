"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import PinRoundedIcon from "@mui/icons-material/PinRounded";
import { FormActions, PinField, SectionCard } from "@/components/ui";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import type { CorrectionPinView } from "@/lib/contracts";
import { routes } from "@/lib/routes";
import { CORRECTION_LIMITS } from "@/lib/validation";
import { useDates } from "@/components/ui/useDates";

const SETUP_SCRIPT = "supabase/scripts/open_correction_pin_setup.sql";

/**
 * The corrections PIN (0039, A35): the PIN that confirms every change to
 * past records. Kept in the database, never shown. A first PIN (or a new one
 * after it's forgotten) can be set only while setup is open, which only the
 * Supabase SQL editor can do; changing it needs the current PIN. Locked out:
 * nothing can be saved until it unlocks.
 */
export default function CorrectionPinCard({ status }: { status: CorrectionPinView }) {
  const { formatDateTime } = useDates();
  const router = useAppRouter();
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<string | null>(null);

  const setup = !status.pinSet && Boolean(status.setupUntil);
  const canSave = !status.lockedUntil && (status.pinSet || setup);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPinError(null);
    setMismatch(null);
    if (pin !== confirmPin) {
      setMismatch("The two PINs don't match");
      return;
    }
    setSubmitting(true);
    try {
      await api.dashboard.setCorrectionPin({ pin, currentPin: status.pinSet ? currentPin : undefined });
      setCurrentPin("");
      setPin("");
      setConfirmPin("");
      router.replace(routes.profile({ pinSaved: "1" }));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.field === "pin") setPinError(err.message);
      else setError(errorMessage(err, "Couldn't save the PIN."));
      setCurrentPin("");
    } finally {
      setSubmitting(false);
    }
  }

  const summary = status.lockedUntil
    ? null
    : status.pinSet
      ? `Set${status.pinSetAt ? ` ${formatDateTime(status.pinSetAt)}` : ""}. ${CORRECTION_LIMITS.attemptsBeforeLock} wrong PINs in a row lock corrections for ${CORRECTION_LIMITS.lockMinutes} minutes, and 10 in a day for 24 hours.`
      : setup
        ? `Setup is open until ${formatDateTime(status.setupUntil!)}: set your PIN now.`
        : null;

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ height: "100%" }}>
      <SectionCard
        fill
        title="Corrections PIN"
        caption={`A ${CORRECTION_LIMITS.pinLength}-digit PIN that confirms every change to past records: Correct rent, "paid up to" and move-out date, Adjust on a payment, Stop tracking, and a move-out dated before last month.`}
        icon={<PinRoundedIcon />}
        tone="warning"
      >
        {status.lockedUntil ? (
          <Alert severity="error">
            Too many wrong PINs: corrections are locked until {formatDateTime(status.lockedUntil)}. To unlock sooner, or
            if you&apos;ve forgotten the PIN, open PIN setup again (below) and set a new one.
          </Alert>
        ) : null}
        {!status.pinSet && !setup ? (
          <Alert severity="info">
            No PIN is set, so no correction can be saved. For safety the first PIN can&apos;t be set from a signed-in
            session alone: in the Supabase dashboard, open the SQL editor and run <code>{SETUP_SCRIPT}</code>. Then come
            back here within 15 minutes and set it.
          </Alert>
        ) : null}
        {summary ? (
          <Typography variant="body2" color="textSecondary">
            {summary}
          </Typography>
        ) : null}
        {canSave ? (
          <>
            {status.pinSet ? (
              <PinField label="Current PIN" value={currentPin} onChange={setCurrentPin} error={pinError} />
            ) : null}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <PinField
                label={status.pinSet ? "New PIN" : "PIN"}
                value={pin}
                onChange={setPin}
                autoComplete="new-password"
                error={status.pinSet ? null : pinError}
                helperText={`${CORRECTION_LIMITS.pinLength} digits, not your phone's PIN.`}
              />
              <PinField
                label="Confirm PIN"
                value={confirmPin}
                onChange={setConfirmPin}
                autoComplete="new-password"
                error={mismatch}
              />
            </Stack>
            <FormActions
              error={error}
              submitLabel={status.pinSet ? "Change PIN" : "Set PIN"}
              pendingLabel="Saving…"
              pending={submitting}
            />
          </>
        ) : null}
        {status.pinSet ? (
          <Typography variant="caption" color="textSecondary">
            Forgotten it? Run <code>{SETUP_SCRIPT}</code> in the Supabase SQL editor; it clears the PIN and opens setup
            for 15 minutes.
          </Typography>
        ) : null}
      </SectionCard>
    </Box>
  );
}
