"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import { routes } from "@/lib/routes";
import { CORRECTION_LIMITS } from "@/lib/validation";
import { LoadingButton } from "./Loading";
import PinField from "./PinField";
import TextLink from "./TextLink";

/**
 * Every change to the ledger's history goes through this dialog (0039, A35):
 * step 1 is the fix (`children`), step 2 reviews what will change (`review`)
 * and asks for the corrections PIN. Presentational: `onConfirm(pin)` does the
 * work and returns whether it succeeded.
 *
 * - `pinError` (a wrong PIN, locked) shows under the PIN, which is cleared;
 *   `error` (the database refused the correction) shows above, and the PIN
 *   stays. `onStepChange` lets the caller clear both.
 * - `blocked` (no PIN set, corrections locked) shows from step 1 and keeps
 *   Review and Confirm off, so nothing is typed in vain.
 * - Full screen on phones, so the buttons stay above the keyboard.
 */
export default function CorrectionDialog({
  open,
  title,
  children,
  review,
  canReview,
  confirmLabel = "Confirm correction",
  destructive = false,
  busy,
  error,
  pinError,
  blocked,
  onStepChange,
  onClose,
  onConfirm,
  maxWidth = "xs",
}: {
  open: boolean;
  title: string;
  /** The fix itself. Omit to open straight on the review (nothing to fill in). */
  children?: ReactNode;
  /** What will change, before -> after. Shown with the PIN field. */
  review: ReactNode;
  /** Step 1 is complete and differs from what's there now. */
  canReview: boolean;
  confirmLabel?: string;
  /** Red confirm button (it removes something). */
  destructive?: boolean;
  busy: boolean;
  error: string | null;
  pinError?: string | null;
  blocked?: string | null;
  onStepChange?: () => void;
  onClose: () => void;
  onConfirm: (pin: string) => Promise<boolean>;
  maxWidth?: "xs" | "sm";
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const hasForm = children !== undefined;
  const [step, setStep] = useState<"fix" | "review">(hasForm ? "fix" : "review");
  const [pin, setPin] = useState("");
  const pinRef = useRef<HTMLInputElement>(null);
  const fixRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // A fresh start each time it opens (state adjusted while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(hasForm ? "fix" : "review");
      setPin("");
    }
  }

  // Focus follows the step: the PIN on the review, the first field back on the fix.
  useEffect(() => {
    if (step === "review") pinRef.current?.focus();
    else fixRef.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
  }, [step]);

  function goTo(next: "fix" | "review") {
    onStepChange?.();
    setStep(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    // React events cross the portal: don't let this submit a form the dialog sits in.
    event.stopPropagation();
    if (busy || blocked) return;
    if (step === "fix") {
      if (canReview) goTo("review");
      return;
    }
    if (pin.length !== CORRECTION_LIMITS.pinLength) return;
    if (!(await onConfirm(pin))) {
      setPin("");
      pinRef.current?.focus();
    }
  }

  const blockedAlert = blocked ? (
    <Alert severity="warning">
      {blocked}{" "}
      <TextLink href={routes.profile()} target="_blank" rel="noopener">
        Open Profile in a new tab
      </TextLink>
    </Alert>
  ) : null;

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      fullWidth
      fullScreen={phone}
      maxWidth={maxWidth}
      aria-labelledby={titleId}
      slotProps={{ paper: { component: "form", onSubmit: submit } }}
    >
      <DialogTitle id={titleId}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <LockRoundedIcon fontSize="small" color="action" />
          <span>{step === "fix" ? title : `Review: ${title.toLowerCase()}`}</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {blockedAlert}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {step === "fix" ? (
            <Stack ref={fixRef} spacing={2}>
              {children}
            </Stack>
          ) : (
            <>
              {review}
              <PinField
                inputRef={pinRef}
                value={pin}
                onChange={setPin}
                disabled={Boolean(blocked)}
                error={pinError}
                helperText={`The ${CORRECTION_LIMITS.pinLength}-digit PIN that confirms changes to past records.`}
              />
              <Typography variant="caption" color="textSecondary">
                No PIN yet, or forgotten? See <TextLink href={routes.profile()} target="_blank" rel="noopener">Profile</TextLink>{" "}
                (opens in a new tab).
              </Typography>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {step === "review" && hasForm ? (
          <Button onClick={() => goTo("fix")} disabled={busy}>
            Back
          </Button>
        ) : (
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        )}
        {step === "fix" ? (
          <Button type="submit" variant="contained" disabled={!canReview || Boolean(blocked)}>
            Review
          </Button>
        ) : (
          <LoadingButton
            type="submit"
            variant="contained"
            color={destructive ? "error" : "primary"}
            disabled={pin.length !== CORRECTION_LIMITS.pinLength || Boolean(blocked)}
            loading={busy}
          >
            {busy ? "Saving…" : confirmLabel}
          </LoadingButton>
        )}
      </DialogActions>
    </Dialog>
  );
}
