"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { FormActions, SectionCard } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import type { PropertyHeader } from "@/lib/contracts";
import type { UnitType } from "@/lib/types";
import { UNIT_TYPE_OPTIONS } from "@/lib/domain/tenant";
import { routes } from "@/lib/routes";

/**
 * Adds a house to a tower. With `propertyCode` the tower is fixed (the
 * tower's own Add house page); with `towers` the owner picks it here (the
 * side-menu shortcut).
 */
export default function UnitForm({ propertyCode: fixedTower, towers }: { propertyCode?: string; towers?: PropertyHeader[] }) {
  const router = useAppRouter();
  const [chosenTower, setChosenTower] = useState(towers?.length === 1 ? towers[0].code : "");
  const propertyCode = fixedTower ?? chosenTower;
  const [houseNumber, setHouseNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [unitType, setUnitType] = useState<UnitType>("residential");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const house = houseNumber.trim().toUpperCase();
  const back = fixedTower ? routes.properties.detail(fixedTower) : routes.properties.list;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!propertyCode) {
      setError("Choose the tower this house is in");
      return;
    }
    setSubmitting(true);
    try {
      await api.dashboard.properties.createUnit(propertyCode, {
        houseNumber: house,
        floor: floor.trim() || undefined,
        unitType,
        label: label.trim() || undefined,
      });
      router.push(routes.properties.detail(propertyCode));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that house."));
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 720 }}>
      <Stack spacing={2}>
        <SectionCard title="House details">
          {fixedTower ? null : (
            <TextField
              label="Tower"
              select
              value={chosenTower}
              onChange={(e) => setChosenTower(e.target.value)}
              helperText={towers?.length ? "The house code starts with the tower's code" : "No towers yet - add a property first"}
              required
              fullWidth
            >
              {(towers ?? []).map((t) => (
                <MenuItem key={t.code} value={t.code}>
                  {t.code} - {t.name} ({t.locationName})
                </MenuItem>
              ))}
            </TextField>
          )}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="House number"
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
              helperText={house && propertyCode ? `House code: ${propertyCode}-${house}` : "e.g. G13 or 108"}
              required
              fullWidth
            />
            <TextField
              label="Floor"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              helperText="G for ground, a number, or blank"
              fullWidth
            />
          </Stack>
          <TextField label="Type" select value={unitType} onChange={(e) => setUnitType(e.target.value as UnitType)} fullWidth>
            {UNIT_TYPE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            helperText="Optional, e.g. Cabin Room or Godown"
            fullWidth
          />
        </SectionCard>
        <FormActions error={error} cancelHref={back} submitLabel="Save" pendingLabel="Saving…" pending={submitting} />
      </Stack>
    </Box>
  );
}
