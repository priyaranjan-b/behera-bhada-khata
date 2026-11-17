"use client";

import { useState } from "react";
import { CorrectionDialog } from "@/components/ui";
import { useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import { api } from "@/lib/api-client";
import { routes } from "@/lib/routes";
import { useCorrectionSubmit } from "./useCorrectionSubmit";

/**
 * Undoes start_rent_tracking for a government tenant while nothing is
 * recorded (stop_rent_tracking, 0016): their rent months go. Confirmed with
 * the corrections PIN (0039); nothing to fill in, so it opens on the review.
 */
export default function StopRentTrackingButton({ tenantId }: { tenantId: string }) {
  const router = useAppRouter();
  const [open, setOpen] = useState(false);
  const correction = useCorrectionSubmit("Couldn't stop tracking rent.", open);

  const confirm = (pin: string) =>
    correction.submit(
      () => api.dashboard.tenants.stopRentTracking(tenantId, { pin }),
      () => {
        setOpen(false);
        router.push(routes.tenants.detail(tenantId, { corrected: "1" }));
      }
    );

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="error"
        aria-label="Stop tracking rent"
        startIcon={<LockRoundedIcon fontSize="small" />}
        onClick={() => {
          correction.clearErrors();
          setOpen(true);
        }}
      >
        Stop tracking
      </Button>
      <CorrectionDialog
        open={open}
        title="Stop tracking rent"
        canReview
        destructive
        confirmLabel="Stop tracking"
        busy={correction.busy}
        error={correction.error}
        pinError={correction.pinError}
        blocked={correction.blocked}
        onStepChange={correction.clearErrors}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        review={
          <Alert severity="warning">
            Their rent months are removed and the rent is treated as paid to you directly again. Possible only while no
            payment is recorded.
          </Alert>
        }
      />
    </>
  );
}
