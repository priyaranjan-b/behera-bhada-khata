"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import { createClient } from "@/lib/supabase/client";

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

      const { error: setSessionError } = await createClient().auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (cancelled) return;
      if (setSessionError) {
        setError(setSessionError.message);
        return;
      }
      window.location.assign(next);
    }

    void finishSignIn();
    return () => {
      cancelled = true;
    };
  }, [next]);

  if (error) {
    return (
      <Box sx={{ maxWidth: 400, mx: "auto", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", px: 2 }}>
        <Stack spacing={2}>
          <Alert severity="error">{decodeURIComponent(error)}</Alert>
          <Button href="/login" size="small">
            Back to sign in
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        maxWidth: 400,
        mx: "auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
      }}
    >
      <Typography variant="body2" color="textSecondary">
        Signing you in…
      </Typography>
    </Box>
  );
}
