"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { FormActions, SectionCard } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import type { LocationSummary } from "@/lib/contracts";

export default function PropertyForm({ locations }: { locations: LocationSummary[] }) {
  const router = useAppRouter();
  const [locationCode, setLocationCode] = useState(locations[0]?.code ?? "");
  const [towerCode, setTowerCode] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tower = towerCode.trim().toUpperCase();
  const preview = locationCode && tower ? `${locationCode}-${tower}` : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { code } = await api.dashboard.properties.create({ locationCode, towerCode: tower, name });
      router.push(`/dashboard/properties/${code}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that tower."));
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 720 }}>
      <Stack spacing={2}>
        <SectionCard title="Tower details">
          <TextField
            label="Site"
            select
            value={locationCode}
            onChange={(e) => setLocationCode(e.target.value)}
            required
            fullWidth
            helperText={locations.length === 0 ? "Load the master data first - no sites exist yet." : undefined}
          >
            {locations.map((l) => (
              <MenuItem key={l.code} value={l.code}>
                {l.name} ({l.code})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Tower code"
            value={towerCode}
            onChange={(e) => setTowerCode(e.target.value)}
            helperText={preview ? `Property code: ${preview}` : "T followed by a number or letters, e.g. T3"}
            required
            fullWidth
          />
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText="e.g. Tower 3 or Post Office House - can be renamed later"
            required
            fullWidth
          />
        </SectionCard>
        <FormActions
          error={error}
          cancelHref="/dashboard/properties"
          submitLabel="Save"
          pendingLabel="Saving…"
          pending={submitting}
          disabled={locations.length === 0}
        />
      </Stack>
    </Box>
  );
}
