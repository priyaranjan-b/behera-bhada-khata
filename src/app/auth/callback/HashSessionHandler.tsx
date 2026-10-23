"use client";

import { useEffect, useState } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { BrandIcon } from "@/components/shell/BrandMark";
import { PublicCard, PublicLayout } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";

export default function HashSessionHandler({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finishSignIn() {
      // window.location is only reachable after mount; hop a microtask so
      // every setState below runs from a callback rather than synchronously
      // in the effect body.
      await Promise.resolve();
      if (cancelled) return;

      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      const params = new URLSearchParams(hash);

      const hashError = params.get("error_description") ?? params.get("error");
      if (hashError) {
        setError(hashError.replace(/\+/g, " "));
        return;
      }

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        setError("This sign-in link is missing or invalid.");
        return;
      }

      try {
        await api.auth.setSession({ accessToken, refreshToken });
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Sign-in failed"));
        return;
      }
      if (!cancelled) window.location.assign(next);
    }

    void finishSignIn();
    return () => {
      cancelled = true;
    };
  }, [next]);

  return (
    <PublicLayout width="sm">
      <PublicCard>
        <Stack spacing={2.5} sx={{ alignItems: "center", textAlign: "center" }}>
          <BrandIcon size={44} />
          {error ? (
            <Typography component="h1" variant="subtitle1">
              Sign-in failed
            </Typography>
          ) : (
            <>
              <CircularProgress size={28} aria-label="Signing you in" />
              <Typography role="status" variant="body2" color="textSecondary">
                Signing you in…
              </Typography>
            </>
          )}
        </Stack>
        {error ? (
          <>
            <Alert severity="error">{decodeURIComponent(error)}</Alert>
            <Button href="/login" variant="contained" size="large" fullWidth>
              Back to sign in
            </Button>
          </>
        ) : null}
      </PublicCard>
    </PublicLayout>
  );
}
