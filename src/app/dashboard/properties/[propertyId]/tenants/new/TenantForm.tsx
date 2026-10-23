"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import BusinessRoundedIcon from "@mui/icons-material/BusinessRounded";
import { FormActions, SectionCard } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import type { CreateTenantInput } from "@/lib/contracts";

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
      await api.dashboard.properties.createTenant(propertyId, {
        name,
        businessName: unitType === "commercial" ? businessName || undefined : undefined,
        unitType,
        tower: tower || undefined,
        floor: floor || undefined,
        houseNumber: houseNumber || undefined,
        phone,
        preferredChannel: preferredChannel as CreateTenantInput["preferredChannel"],
        monthlyRentAmount: Number(monthlyRentAmount),
        leaseStart,
      });
      router.push(`/dashboard/properties/${propertyId}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that tenant."));
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 720 }}>
      <Stack spacing={2}>
        <SectionCard title="Tenant details">
          <Stack spacing={1}>
            <Typography variant="body2" color="textSecondary" id="unit-type-label">
              Unit type
            </Typography>
            <ToggleButtonGroup
              value={unitType}
              exclusive
              onChange={(_, value) => value && setUnitType(value)}
              fullWidth
              aria-labelledby="unit-type-label"
            >
              <ToggleButton value="residential">
                <Stack component="span" direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <HomeRoundedIcon fontSize="small" />
                  <span>Residential</span>
                </Stack>
              </ToggleButton>
              <ToggleButton value="commercial">
                <Stack component="span" direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <BusinessRoundedIcon fontSize="small" />
                  <span>Commercial</span>
                </Stack>
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

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
        </SectionCard>

        <SectionCard title="Tenancy & rent">
          <Typography variant="body2" color="textSecondary">
            Unit identifier
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField label="Tower" value={tower} onChange={(e) => setTower(e.target.value)} fullWidth />
            <TextField label="Floor" value={floor} onChange={(e) => setFloor(e.target.value)} fullWidth />
            <TextField
              label="House no."
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
              fullWidth
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
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
          </Stack>
        </SectionCard>

        <FormActions
          error={error}
          cancelHref={`/dashboard/properties/${propertyId}`}
          submitLabel="Save"
          pendingLabel="Saving…"
          pending={submitting}
        />
      </Stack>
    </Box>
  );
}
