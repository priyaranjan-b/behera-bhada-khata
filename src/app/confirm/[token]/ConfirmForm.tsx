"use client";

import { useRef, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import SignaturePad, { type SignaturePadHandle } from "@/components/SignaturePad";

type Step = "idle" | "sendingOtp" | "otpSent" | "submitting" | "success";

export default function ConfirmForm({
  token,
  recordType,
  maskedPhone,
}: {
  token: string;
  recordType: "payment" | "adjustment";
  maskedPhone: string;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const padHandle = useRef<SignaturePadHandle | null>(null);

  async function sendOtp() {
    setError(null);
    setStep("sendingOtp");
    try {
      const res = await fetch(`/api/confirm/${token}/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordType }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not send code");
      setSentTo(body.maskedPhone ?? maskedPhone);
      setStep("otpSent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send code");
      setStep("idle");
    }
  }

  async function submitConfirmation() {
    setError(null);
    if (!padHandle.current || padHandle.current.isEmpty()) {
      setError("Please sign before confirming");
      return;
    }
    if (otpCode.trim().length < 4) {
      setError("Enter the code sent to your phone");
      return;
    }

    setStep("submitting");
    try {
      const res = await fetch(`/api/confirm/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType,
          otpCode: otpCode.trim(),
          tenantSignaturePng: padHandle.current.toPngDataUrl(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not confirm");
      setReceiptUrl(body.receiptUrl);
      setStep("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm");
      setStep("otpSent");
    }
  }

  if (step === "success") {
    return (
      <Alert
        severity="success"
        action={
          receiptUrl ? (
            <Button color="inherit" size="small" href={receiptUrl} target="_blank" rel="noreferrer">
              View receipt
            </Button>
          ) : undefined
        }
      >
        Confirmed. Thank you.
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      {step === "idle" || step === "sendingOtp" ? (
        <Button variant="contained" size="large" onClick={sendOtp} disabled={step === "sendingOtp"}>
          {step === "sendingOtp" ? "Sending code…" : `Send verification code to ${maskedPhone}`}
        </Button>
      ) : (
        <>
          <TextField
            id="otpCode"
            label={`Code sent to ${sentTo}`}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            placeholder="6-digit code"
            fullWidth
          />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Your signature
            </Typography>
            <Paper variant="outlined" sx={{ p: 0.5 }}>
              <SignaturePad onReady={(handle) => (padHandle.current = handle)} />
            </Paper>
            <Button size="small" onClick={() => padHandle.current?.clear()} sx={{ mt: 0.5 }}>
              Clear
            </Button>
          </Box>

          <Button variant="contained" size="large" onClick={submitConfirmation} disabled={step === "submitting"}>
            {step === "submitting" ? "Confirming…" : "Sign & confirm"}
          </Button>
        </>
      )}

      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
