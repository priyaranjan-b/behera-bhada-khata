"use client";

import { useId, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import ReceiptLongRoundedIcon from "@mui/icons-material/ReceiptLongRounded";
import DrawRoundedIcon from "@mui/icons-material/DrawRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import { BrandMark } from "@/components/shell/BrandMark";
import { PublicCard, PublicHeading, PublicLayout } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import { LoadingButton } from "@/components/ui/Loading";
import { PASSWORD_LIMITS } from "@/lib/validation";

const valuePoints = [
  {
    icon: ReceiptLongRoundedIcon,
    title: "Record rent in seconds",
    description: "Log a payment against one or more months and send the tenant a link over WhatsApp or SMS.",
  },
  {
    icon: DrawRoundedIcon,
    title: "Tenant signs and verifies",
    description: "Tenants draw a signature and confirm with a one-time SMS code - no app or login needed.",
  },
  {
    icon: PictureAsPdfRoundedIcon,
    title: "Signed PDF receipts",
    description: "Every confirmed payment produces a signed receipt for both owner and tenant.",
  },
  {
    icon: EventRepeatRoundedIcon,
    title: "Arrears at a glance",
    description: "Months owed are tracked automatically, so unpaid rent shows up even if nothing was logged.",
  },
];

type State =
  | { step: "idle" | "sending" }
  | { step: "error"; message: string }
  | { step: "sent"; dev: false }
  | { step: "sent"; dev: true; link: string };

type Method = "password" | "link";

function ValuePoints() {
  return (
    <Stack spacing={4} sx={{ display: { xs: "none", md: "flex" }, maxWidth: 450 }}>
      <BrandMark iconSize={40} />
      {valuePoints.map(({ icon: Icon, title, description }) => (
        <Stack key={title} direction="row" spacing={2}>
          <Typography component="span" color="textSecondary" aria-hidden>
            <Icon />
          </Typography>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2">{title}</Typography>
            <Typography variant="body2" color="textSecondary">
              {description}
            </Typography>
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}

export default function LoginForm({
  next,
  initialError,
  devLogin,
}: {
  next: string;
  /** Why the visitor was sent back here (a failed link, not the owner), if they were. */
  initialError: string | null;
  /** The server hands the link back instead of emailing it (ALLOW_DEV_LOGIN). */
  devLogin: boolean;
}) {
  const tabsId = useId();
  const [method, setMethod] = useState<Method>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>(
    initialError ? { step: "error", message: initialError } : { step: "idle" }
  );

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ step: "sending" });
    try {
      const result = await api.auth.signInWithPassword({ email, password, next });
      // A full load, so the proxy and the server render see the new session cookie.
      window.location.assign(result.next);
    } catch (err) {
      setState({ step: "error", message: errorMessage(err, "Couldn't sign in. Try again.") });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ step: "sending" });
    try {
      const result = await api.auth.requestMagicLink({ email, next });
      setState(result.dev ? { step: "sent", dev: true, link: result.link } : { step: "sent", dev: false });
    } catch (err) {
      setState({ step: "error", message: errorMessage(err, "Couldn't send the link. Try again.") });
    }
  }

  return (
    <PublicLayout width="lg">
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 4, md: 12 }}
        useFlexGap
        sx={{ justifyContent: "center", alignItems: "center" }}
      >
        <ValuePoints />

        <PublicCard>
          <Box sx={{ display: { xs: "flex", md: "none" } }}>
            <BrandMark />
          </Box>
          <PublicHeading
            title="Sign in"
            subtitle={
              method === "password" ? "Owner email and password." : <>We&apos;ll email you a one-time sign-in link.</>
            }
          />

          <Tabs
            value={method}
            onChange={(_, value: Method) => {
              setMethod(value);
              setState({ step: "idle" });
            }}
            variant="fullWidth"
          >
            <Tab label="Password" value="password" id={`${tabsId}-password-tab`} aria-controls={`${tabsId}-panel`} />
            <Tab label="Email link" value="link" id={`${tabsId}-link-tab`} aria-controls={`${tabsId}-panel`} />
          </Tabs>

          <Box id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${method}-tab`}>
            {method === "password" ? (
              <Box component="form" onSubmit={handlePasswordSubmit}>
                <Stack spacing={2}>
                  <TextField
                    type="email"
                    label="Owner email"
                    required
                    autoComplete="email"
                    autoFocus
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    fullWidth
                  />
                  <TextField
                    type="password"
                    label="Password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    fullWidth
                    slotProps={{ htmlInput: { maxLength: PASSWORD_LIMITS.maxLength } }}
                  />
                  {state.step === "error" ? <Alert severity="error">{state.message}</Alert> : null}
                  <LoadingButton type="submit" variant="contained" size="large" fullWidth loading={state.step === "sending"}>
                    {state.step === "sending" ? "Signing in…" : "Sign in"}
                  </LoadingButton>
                  <Typography variant="caption" color="textSecondary">
                    No password yet? Sign in with an email link, then set one on your Profile page.
                  </Typography>
                </Stack>
              </Box>
            ) : state.step === "sent" ? (
              <Stack spacing={2}>
                {state.dev ? (
                  <>
                    <Alert severity="success">
                      No email sent (dev mode). This link is single-use - if it fails, come back and
                      request a new one rather than reusing it.
                    </Alert>
                    <Button href={state.link} variant="contained" size="large" fullWidth>
                      Sign in
                    </Button>
                  </>
                ) : (
                  <Alert severity="success">If that email belongs to an owner, a sign-in link is on its way.</Alert>
                )}
              </Stack>
            ) : (
              <Box component="form" onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  <TextField
                    type="email"
                    label="Owner email"
                    required
                    autoComplete="email"
                    autoFocus
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    fullWidth
                  />
                  {state.step === "error" ? <Alert severity="error">{state.message}</Alert> : null}
                  <LoadingButton type="submit" variant="contained" size="large" fullWidth loading={state.step === "sending"}>
                    {state.step === "sending" ? "Sending…" : "Send sign-in link"}
                  </LoadingButton>
                  {devLogin ? (
                    <Typography variant="caption" color="textSecondary">
                      Dev mode: no email will actually be sent - you&apos;ll get a clickable sign-in
                      button on the next screen.
                    </Typography>
                  ) : null}
                </Stack>
              </Box>
            )}
          </Box>
        </PublicCard>
      </Stack>
    </PublicLayout>
  );
}
