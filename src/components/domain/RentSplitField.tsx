"use client";

import { useId } from "react";
import Button from "@mui/material/Button";
import FormHelperText from "@mui/material/FormHelperText";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { formatMoney } from "@/lib/money";
import type { RentSplit } from "./useRentSplit";

/**
 * Asks how a tenant's rent splits over their houses (D39): one amount per
 * house, which must add up to the rent. Each house keeps its part as its
 * rent once vacant, to price the next tenant. Renders nothing when only one
 * house (or no rent) is involved.
 */
export default function RentSplitField({ split, disabled }: { split: RentSplit; disabled?: boolean }) {
  const titleId = useId();
  const statusId = useId();
  if (!split.needed) return null;
  return (
    <Stack spacing={1.5} role="group" aria-labelledby={titleId}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="subtitle2" component="h3" id={titleId}>
          Rent for each house
        </Typography>
        <Button size="small" onClick={split.splitEqually} disabled={disabled}>
          Split equally
        </Button>
      </Stack>
      <Typography variant="body2" color="textSecondary">
        How {formatMoney(split.rent)} splits between the houses, starting in proportion to their current rents. A house
        keeps its rent while vacant, to help price the next tenant. The tenant still pays one combined rent.
      </Typography>
      <Grid container spacing={1.5}>
        {split.houses.map((h) => (
          <Grid key={h.unitCode} size={{ xs: 12, sm: 6 }}>
            <TextField
              label={h.label ? `${h.unitCode} · ${h.label}` : h.unitCode}
              type="number"
              value={split.inputs[h.unitCode] ?? ""}
              onChange={(e) => split.setShare(h.unitCode, e.target.value)}
              disabled={disabled}
              required
              fullWidth
              slotProps={{ htmlInput: { step: "0.01", min: 0, "aria-describedby": statusId } }}
            />
          </Grid>
        ))}
      </Grid>
      {/* Tied to each field, not a live region: read with the field, not on every keystroke. */}
      <FormHelperText id={statusId} error={Boolean(split.problem)}>
        {split.problem ?? `Adds up to ${formatMoney(split.rent)}.`}
      </FormHelperText>
    </Stack>
  );
}
