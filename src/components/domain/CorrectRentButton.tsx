"use client";

import { useState } from "react";
import { CorrectionDialog, DetailList, DetailRow, MonthField } from "@/components/ui";
import { useAppRouter } from "@/components/ui/Loading";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import { api } from "@/lib/api-client";
import { formatMonth, monthKeyOf, yearMonthOf } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";
import RentSplitField from "./RentSplitField";
import { useCorrectionSubmit } from "./useCorrectionSubmit";
import { useRentSplit, type RentSplitHouse } from "./useRentSplit";

/**
 * Fixes a rent entered wrongly (correct_rent, 0025): every month from the one
 * chosen is re-priced, paid months included. A real rent change goes through
 * Edit tenant, where paid months keep their price. With several `houses`,
 * asks how the corrected rent splits between them (D39); a moved-out
 * tenant passes none, as their old houses may be let again. Reviewed and
 * confirmed with the corrections PIN (0039).
 */
export default function CorrectRentButton({
  tenantId,
  billingStart,
  monthlyRent,
  houses,
}: {
  tenantId: string;
  billingStart: string;
  monthlyRent: number;
  houses: RentSplitHouse[];
}) {
  const router = useAppRouter();
  const firstMonth = yearMonthOf(billingStart);
  const [open, setOpen] = useState(false);
  const [rent, setRent] = useState(String(monthlyRent));
  const [fromMonth, setFromMonth] = useState(firstMonth);
  const correction = useCorrectionSubmit("Couldn't correct the rent.", open);

  const rentNumber = Number(rent) || 0;
  const split = useRentSplit(rentNumber, houses);
  const ready = rentNumber > 0 && Boolean(fromMonth) && !split.problem;
  const from = fromMonth ? formatMonth(monthKeyOf(fromMonth)) : "";

  const confirm = (pin: string) =>
    correction.submit(
      () => api.dashboard.tenants.correctRent(tenantId, { fromMonth, monthlyRent: rentNumber, houseRents: split.houseRents, pin }),
      () => {
        setOpen(false);
        router.push(routes.tenants.detail(tenantId, { corrected: "1" }));
      }
    );

  return (
    <>
      <Button
        size="small"
        aria-label="Correct rent"
        startIcon={<LockRoundedIcon fontSize="small" />}
        onClick={() => {
          setRent(String(monthlyRent));
          setFromMonth(firstMonth);
          correction.clearErrors();
          setOpen(true);
        }}
      >
        Correct
      </Button>
      <CorrectionDialog
        open={open}
        title="Correct the rent"
        maxWidth={split.needed ? "sm" : "xs"}
        canReview={ready}
        busy={correction.busy}
        error={correction.error}
        pinError={correction.pinError}
        blocked={correction.blocked}
        onStepChange={correction.clearErrors}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        review={
          ready ? (
            <>
              <DetailList dividers>
                <DetailRow label="Rent now">{formatMoney(monthlyRent)} / month</DetailRow>
                <DetailRow label={`From ${from} on`}>{formatMoney(rentNumber)} / month</DetailRow>
              </DetailList>
              <Alert severity="warning">
                Every rent month from {from} on becomes {formatMoney(rentNumber)}, including months already paid and
                any that had a different rate, so what the tenant owes changes. Payments stay as recorded. Not possible
                if more than {formatMoney(rentNumber)} is already counted for one of them.
                {split.needed ? " The houses' rents are set as split." : ""}
              </Alert>
            </>
          ) : null
        }
      >
        <Typography variant="body2" color="textSecondary">
          For a rent entered wrongly: every month from the one you pick is re-priced, including months already paid.
          Payments stay as recorded. For a real rent increase, use Edit tenant instead.
        </Typography>
        <TextField
          label="Monthly rent"
          type="number"
          value={rent}
          onChange={(e) => setRent(e.target.value)}
          required
          fullWidth
          slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
        />
        <MonthField
          label="Correct from"
          value={fromMonth}
          onChange={setFromMonth}
          min={firstMonth}
          helperText={`Billing starts ${formatMonth(billingStart)}`}
          required
          fullWidth
        />
        <RentSplitField split={split} disabled={correction.busy} />
      </CorrectionDialog>
    </>
  );
}
