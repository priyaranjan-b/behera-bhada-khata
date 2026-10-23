"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { FormActions, SectionCard } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";

export default function PropertyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.dashboard.properties.create({ name, address: address || undefined });
      router.push("/dashboard/properties");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't save that property."));
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 720 }}>
      <Stack spacing={2}>
        <SectionCard title="Property details">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
          <TextField
            label="Address"
            helperText="Can hold both residential and commercial units"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            fullWidth
          />
        </SectionCard>
        <FormActions
          error={error}
          cancelHref="/dashboard/properties"
          submitLabel="Save"
          pendingLabel="Saving…"
          pending={submitting}
        />
      </Stack>
    </Box>
  );
}
