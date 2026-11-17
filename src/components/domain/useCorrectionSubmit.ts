"use client";

import { useEffect, useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import { ApiError, api, errorMessage } from "@/lib/api-client";
import type { CorrectionPinView } from "@/lib/contracts";
import { formatDateTime } from "@/lib/dates";

/** Why corrections can't be saved right now (no PIN, locked), or null. */
function blockedBy(status: CorrectionPinView | null): string | null {
  if (!status) return null;
  if (!status.pinSet) return "No corrections PIN is set yet, so this can't be saved.";
  if (status.lockedUntil) return `Too many wrong PINs: corrections are locked until ${formatDateTime(status.lockedUntil)}.`;
  return null;
}

/**
 * Everything a PIN-confirmed correction dialog (CorrectionDialog, 0039) needs
 * besides its fields: the PIN status, read when it opens (`blocked` says
 * there's no PIN or corrections are locked before anything is typed), busy
 * and the two errors - `pinError` for the PIN (field "pin"), `error` for a
 * refusal - and `submit`, which on success runs `after` (close, navigate)
 * and refreshes the page. It resolves to whether it worked.
 */
export function useCorrectionSubmit(fallbackError: string, open: boolean) {
  const router = useAppRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [status, setStatus] = useState<CorrectionPinView | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    api.dashboard
      .correctionPin()
      .then((next) => {
        if (live) setStatus(next);
      })
      // The save still checks; a failed read just means no early warning.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open]);

  function clearErrors() {
    setError(null);
    setPinError(null);
  }

  async function submit(run: () => Promise<unknown>, after?: () => void): Promise<boolean> {
    setBusy(true);
    clearErrors();
    try {
      await run();
      after?.();
      router.refresh();
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.field === "pin") setPinError(err.message);
      else setError(errorMessage(err, fallbackError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, pinError, blocked: blockedBy(status), clearErrors, submit };
}
