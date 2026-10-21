"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

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
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address: address || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't save that property.");
      router.push("/dashboard/properties");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 480 }}>
      <Stack spacing={2}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
        <TextField
          label="Address"
          helperText="Can hold both residential and commercial units"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          fullWidth
        />
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Button type="submit" variant="contained" size="large" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </Stack>
    </Box>
  );
}
