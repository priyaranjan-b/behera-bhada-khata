"use client";

import { useState } from "react";
import { useAppRouter } from "@/components/ui/Loading";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import { FormActions, SectionCard } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import { routes } from "@/lib/routes";
import { PASSWORD_LIMITS } from "@/lib/validation";

/** Sets the owner's password, so they can sign in without an email link. */
export default function ChangePasswordCard() {
  const router = useAppRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.dashboard.changePassword({ password, confirmPassword });
      setPassword("");
      setConfirmPassword("");
      router.replace(routes.profile({ passwordChanged: "1" }));
    } catch (err) {
      setError(errorMessage(err, "Couldn't change the password."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <SectionCard title="Password" caption="Sign in with your email and this password instead of an email link.">
        <TextField
          type="password"
          label="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
          autoComplete="new-password"
          helperText={`At least ${PASSWORD_LIMITS.minLength} characters.`}
          slotProps={{ htmlInput: { minLength: PASSWORD_LIMITS.minLength, maxLength: PASSWORD_LIMITS.maxLength } }}
        />
        <TextField
          type="password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          fullWidth
          autoComplete="new-password"
          slotProps={{ htmlInput: { maxLength: PASSWORD_LIMITS.maxLength } }}
        />
        <FormActions error={error} submitLabel="Set password" pendingLabel="Saving…" pending={submitting} />
      </SectionCard>
    </Box>
  );
}
