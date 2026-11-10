"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { LoadingButton, useAppRouter } from "@/components/ui/Loading";
import TextLink from "@/components/ui/TextLink";
import { api, errorMessage } from "@/lib/api-client";
import type { UnitRow } from "@/lib/contracts";
import { housesRentWith, tenantRentGap } from "@/lib/domain/houses";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";

/**
 * Sets what a house goes for by hand (D39). Never changes what its tenant
 * pays: when the house is let and the houses' rents would no longer add up
 * to the tenant's rent, it says so and the button reads "Save anyway".
 */
export default function HouseRentDialog({ unit, onClose }: { unit: UnitRow; onClose: () => void }) {
  const router = useAppRouter();
  const [value, setValue] = useState(unit.baseRent ? String(unit.baseRent) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rent = value.trim() === "" ? null : Number(value);
  const valid = rent === null || (Number.isFinite(rent) && rent > 0);
  const tenant = unit.currentTenant;
  // The tenant's houses' rents with this one changed (or cleared), against what they pay.
  const housesAfter = tenant ? housesRentWith(tenant.housesRent, unit.baseRent, rent) : 0;
  const mismatch =
    tenant !== null && valid && tenantRentGap({ monthlyRent: tenant.monthlyRent, housesRent: housesAfter }) !== null;
  const several = housesAfter !== (rent ?? 0);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.dashboard.houses.setRent(unit.unitCode, { baseRent: rent });
      onClose();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the house rent."));
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>Rent of {unit.unitCode}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="textSecondary">
            What this house goes for. It stays while the house is vacant, to help price the next tenant, and is updated
            whenever a tenant&apos;s rent is set.
          </Typography>
          <TextField
            label="House rent"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={!valid}
            helperText={valid ? "Up to 2 decimals. Leave empty to clear it." : "Must be more than zero"}
            fullWidth
            autoFocus
            slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
          />
          {mismatch && tenant ? (
            <Alert severity="warning">
              {tenant.displayName} pays {formatMoney(tenant.monthlyRent)} a month
              {several
                ? `; their houses' rents would add up to ${formatMoney(housesAfter)}`
                : rent === null
                  ? ", and this house would have no rent"
                  : ""}
              . This doesn&apos;t change what they pay. To change their rent, use Edit or Correct on{" "}
              <TextLink href={routes.tenants.detail(tenant.id)}>their page</TextLink>.
            </Alert>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <LoadingButton
          variant="contained"
          color={mismatch ? "warning" : "primary"}
          onClick={save}
          disabled={!valid}
          loading={busy}
        >
          {busy ? "Saving…" : mismatch ? "Save anyway" : "Save"}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}
