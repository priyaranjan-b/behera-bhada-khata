"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import InputAdornment from "@mui/material/InputAdornment";
import Typography from "@mui/material/Typography";
import { BrandMark } from "@/components/shell/BrandMark";
import { PublicCard, PublicHeading, PublicLayout } from "@/components/ui";
import { LoadingButton } from "@/components/ui/Loading";
import TextLink from "@/components/ui/TextLink";
import { api, errorMessage } from "@/lib/api-client";
import { DEFAULT_COUNTRY_CODE } from "@/lib/domain/phone";
import { routes } from "@/lib/routes";
import { TENANT_PORTAL_LIMITS } from "@/lib/validation";

const { otpLength, phoneInputMaxLength } = TENANT_PORTAL_LIMITS;

type Step = { step: "phone" } | { step: "code"; devCode?: string };

/**
 * The tenant portal's sign-in (A32): the mobile number the owner has for
 * them, then the code sent to it by SMS. "Code sent" reads the same whether
 * or not the number is a tenant's, so the form reveals nobody.
 */
export default function TenantLoginForm() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<Step>({ step: "phone" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const again = state.step === "code";
    setBusy(true);
    setError(null);
    try {
      const result = await api.tenant.sendOtp({ phone });
      setState({ step: "code", devCode: result.devCode });
      setNotice(
        again
          ? `A new ${otpLength}-digit code is on its way. Use the newest one.`
          : `If this number is registered with your landlord, a ${otpLength}-digit code is on its way by SMS.`
      );
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.tenant.verifyOtp({ phone, code });
      // A full load, so the proxy and the server render see the new session cookie.
      window.location.assign(result.next);
    } catch (err) {
      setError(errorMessage(err, "Couldn't sign in. Try again."));
      setBusy(false);
    }
  }

  function changeNumber() {
    setCode("");
    setError(null);
    setNotice(null);
    setState({ step: "phone" });
  }

  return (
    <PublicLayout width="sm">
      <PublicCard>
        <BrandMark />
        <PublicHeading
          title="Tenant sign-in"
          subtitle="See your rent, payments and receipts. Use the mobile number your landlord has for you."
        />

        {state.step === "phone" ? (
          <Box component="form" onSubmit={sendCode}>
            <Stack spacing={2}>
              <TextField
                label="Mobile number"
                type="tel"
                required
                autoFocus
                autoComplete="tel-national"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                fullWidth
                slotProps={{
                  input: { startAdornment: <InputAdornment position="start">+{DEFAULT_COUNTRY_CODE}</InputAdornment> },
                  htmlInput: { inputMode: "tel", maxLength: phoneInputMaxLength },
                }}
              />
              {error ? <Alert severity="error">{error}</Alert> : null}
              <LoadingButton type="submit" variant="contained" size="large" fullWidth loading={busy}>
                Send code
              </LoadingButton>
            </Stack>
          </Box>
        ) : (
          <Box component="form" onSubmit={verify}>
            <Stack spacing={2}>
              {notice ? <Alert severity="info">{notice}</Alert> : null}
              {state.devCode ? (
                <Alert severity="warning">Dev mode: no SMS sent. The code is {state.devCode}.</Alert>
              ) : null}
              <TextField
                label="Code from the SMS"
                required
                autoFocus
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                fullWidth
                slotProps={{ htmlInput: { inputMode: "numeric", maxLength: otpLength, pattern: "[0-9]*" } }}
                helperText={`${otpLength} digits. No SMS after a minute? Check the number, or ask your landlord which number they have for you.`}
              />
              {error ? <Alert severity="error">{error}</Alert> : null}
              <LoadingButton type="submit" variant="contained" size="large" fullWidth loading={busy}>
                Sign in
              </LoadingButton>
              <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
                <Button size="small" disabled={busy} onClick={changeNumber}>
                  Change number
                </Button>
                <LoadingButton size="small" disabled={busy} onClick={() => sendCode()}>
                  Send a new code
                </LoadingButton>
              </Stack>
            </Stack>
          </Box>
        )}

        <Typography variant="caption" color="textSecondary">
          Landlord? <TextLink href={routes.login()}>Sign in here</TextLink>
        </Typography>
      </PublicCard>
    </PublicLayout>
  );
}
