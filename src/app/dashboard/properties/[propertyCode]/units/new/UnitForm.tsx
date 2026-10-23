"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { FormActions, SectionCard } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import type { UnitType } from "@/lib/types";

export default function UnitForm({ propertyCode }: { propertyCode: string }) {
  const router = useRouter();
  const [houseNumber, setHouseNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [unitType, setUnitType] = useState<UnitType>("residential");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const house = houseNumber.trim().toUpperCase();
  const back = `/dashboard/properties/${propertyCode}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.dashboard.properties.createUnit(propertyCode, {
        houseNumber: house,
        floor: floor.trim() || undefined,
        unitType,
        label: label.trim() || undefined,
      });
      router.push(back);
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
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="House number"
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
              helperText={house ? `House code: ${propertyCode}-${house}` : "e.g. G13 or 108"}
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
            <MenuItem value="residential">Residential</MenuItem>
            <MenuItem value="commercial">Commercial</MenuItem>
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
