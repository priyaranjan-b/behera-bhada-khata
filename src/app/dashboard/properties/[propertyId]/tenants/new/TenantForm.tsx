"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import HomeIcon from "@mui/icons-material/Home";
import BusinessIcon from "@mui/icons-material/Business";

export default function TenantForm({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [unitType, setUnitType] = useState<"residential" | "commercial">("residential");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [tower, setTower] = useState("");
  const [floor, setFloor] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [preferredChannel, setPreferredChannel] = useState("both");
  const [monthlyRentAmount, setMonthlyRentAmount] = useState("");
  const [leaseStart, setLeaseStart] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          businessName: unitType === "commercial" ? businessName || undefined : undefined,
          unitType,
          tower: tower || undefined,
          floor: floor || undefined,
          houseNumber: houseNumber || undefined,
          phone,
          preferredChannel,
          monthlyRentAmount: Number(monthlyRentAmount),
          leaseStart,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save that tenant.");
      router.push(`/dashboard/properties/${propertyId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 480 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Unit type
          </Typography>
          <ToggleButtonGroup
            value={unitType}
            exclusive
            onChange={(_, value) => value && setUnitType(value)}
            fullWidth
          >
            <ToggleButton value="residential">
              <HomeIcon fontSize="small" sx={{ mr: 1 }} />
              Residential
            </ToggleButton>
            <ToggleButton value="commercial">
              <BusinessIcon fontSize="small" sx={{ mr: 1 }} />
              Commercial
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {unitType === "commercial" ? (
          <TextField
            label="Business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            fullWidth
          />
        ) : null}

        <TextField
          label={unitType === "commercial" ? "Contact name" : "Name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          fullWidth
        />

        <TextField
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          helperText="With country code, e.g. +919876543210"
          required
          fullWidth
        />

        <Typography variant="subtitle2">Unit identifier</Typography>
        <Stack direction="row" spacing={1.5}>
          <TextField label="Tower" value={tower} onChange={(e) => setTower(e.target.value)} fullWidth />
          <TextField label="Floor" value={floor} onChange={(e) => setFloor(e.target.value)} fullWidth />
          <TextField
            label="House no."
            value={houseNumber}
            onChange={(e) => setHouseNumber(e.target.value)}
            fullWidth
          />
        </Stack>

        <TextField
          label="Preferred contact channel"
          select
          value={preferredChannel}
          onChange={(e) => setPreferredChannel(e.target.value)}
          fullWidth
        >
          <MenuItem value="both">WhatsApp + SMS</MenuItem>
          <MenuItem value="whatsapp">WhatsApp only</MenuItem>
          <MenuItem value="sms">SMS only</MenuItem>
        </TextField>

        <TextField
          label="Monthly rent"
          type="number"
          value={monthlyRentAmount}
          onChange={(e) => setMonthlyRentAmount(e.target.value)}
          slotProps={{ htmlInput: { step: "0.01", min: 0 } }}
          required
          fullWidth
        />

        <TextField
          label="Lease start"
          type="date"
          value={leaseStart}
          onChange={(e) => setLeaseStart(e.target.value)}
          helperText="First month rent is owed from"
          required
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Button type="submit" variant="contained" size="large" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </Stack>
    </Box>
  );
}
