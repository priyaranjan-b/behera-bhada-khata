"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

const isDev = process.env.NODE_ENV !== "production";

type State =
  | { step: "idle" | "sending" }
  | { step: "error"; message: string }
  | { step: "sent"; dev: false }
  | { step: "sent"; dev: true; link: string };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>(
    searchParams.get("error") ? { step: "error", message: "That sign-in link didn't work. Try again." } : { step: "idle" }
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ step: "sending" });
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't send the link. Try again.");
      setState(body.dev ? { step: "sent", dev: true, link: body.link } : { step: "sent", dev: false });
    } catch (err) {
      setState({ step: "error", message: err instanceof Error ? err.message : "Something went wrong" });
    }
  }

  return (
    <Box
      sx={{
        maxWidth: 400,
        mx: "auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        px: 2,
      }}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Behera Bhada Khata
          </Typography>
          <Typography variant="body2" color="textSecondary">
            ବେହେରା ଭଡ଼ା ଖାତା
          </Typography>
        </Box>

        {state.step === "sent" ? (
          <Stack spacing={2}>
            {state.dev ? (
              <>
                <Alert severity="success">
                  No email sent (dev mode). This link is single-use - if it fails, come back and
                  request a new one rather than reusing it.
                </Alert>
                <Button href={state.link} variant="contained" size="large">
                  Sign in
                </Button>
              </>
            ) : (
              <Alert severity="success">Check your email for a sign-in link.</Alert>
            )}
          </Stack>
        ) : (
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                id="email"
                type="email"
                label="Owner email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
              />
              {state.step === "error" ? <Alert severity="error">{state.message}</Alert> : null}
              <Button type="submit" variant="contained" size="large" disabled={state.step === "sending"}>
                {state.step === "sending" ? "Sending…" : "Send sign-in link"}
              </Button>
              {isDev ? (
                <Typography variant="caption" color="textSecondary">
                  Dev mode: no email will actually be sent - you&apos;ll get a clickable sign-in
                  button on the next screen.
                </Typography>
              ) : null}
            </Stack>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
