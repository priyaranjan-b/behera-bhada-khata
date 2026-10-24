"use client";

import { useRef, useState } from "react";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import { type SignaturePadHandle } from "@/components/ui/SignaturePad";
import { SectionCard, SignatureField } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import LoadingButton from "@/components/ui/Loading/LoadingButton";

type ConfirmStep = "idle" | "sendingOtp" | "otpSent" | "submitting" | "success";

const STEPS = ["Sign", "Verify OTP", "Done"];

export default function ConfirmForm({
  token,
  recordType,
  maskedPhone,
}: {
  token: string;
  recordType: "payment" | "adjustment";
  maskedPhone: string;
}) {
  const [step, setStep] = useState<ConfirmStep>("idle");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const padHandle = useRef<SignaturePadHandle | null>(null);

  async function sendOtp() {
    setError(null);
    setStep("sendingOtp");
    try {
      const sent = await api.confirm.sendOtp(token, recordType);
      setSentTo(sent.maskedPhone ?? maskedPhone);
      setStep("otpSent");
    } catch (e) {
      setError(errorMessage(e, "Could not send code"));
      setStep("idle");
    }
  }

  async function submitConfirmation() {
    setError(null);
    if (!padHandle.current || padHandle.current.isEmpty()) {
      setError("Please sign before submitting");
      return;
    }
    if (otpCode.trim().length < 4) {
      setError("Enter the code sent to your phone");
      return;
    }

    setStep("submitting");
    try {
      const confirmed = await api.confirm.submit(token, {
        recordType,
        otpCode: otpCode.trim(),
        tenantSignaturePng: padHandle.current.toPngDataUrl(),
      });
      setReceiptUrl(confirmed.receiptUrl);
      setStep("success");
    } catch (e) {
      setError(errorMessage(e, "Could not save your acknowledgement"));
      setStep("otpSent");
    }
  }

  const activeStep = step === "success" ? STEPS.length : step === "otpSent" || step === "submitting" ? 1 : 0;

  const stepper = (
    <Stepper activeStep={activeStep} alternativeLabel aria-label="Confirmation progress">
      {STEPS.map((label) => (
        <Step key={label}>
          <StepLabel>{label}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );

  if (step === "success") {
    return (
      <Stack spacing={2}>
        {stepper}
        <Alert severity="success">
          <AlertTitle>Acknowledged</AlertTitle>
          Thank you. Your signed receipt is ready.
        </Alert>
        {receiptUrl ? (
          <Button variant="contained" size="large" fullWidth href={receiptUrl} target="_blank" rel="noreferrer">
            View receipt
          </Button>
        ) : null}
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      {stepper}

      {step === "idle" || step === "sendingOtp" ? (
        <LoadingButton variant="contained" size="large" fullWidth onClick={sendOtp} loading={step === "sendingOtp"}>
          {step === "sendingOtp" ? "Sending code…" : `Send verification code to ${maskedPhone}`}
        </LoadingButton>
      ) : (
        <>
          <SignatureField title="Your signature" onReady={(handle) => (padHandle.current = handle)} />

          <SectionCard title="Verification code">
            <TextField
              id="otpCode"
              label={`Code sent to ${sentTo}`}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              autoComplete="one-time-code"
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              placeholder="6-digit code"
              fullWidth
            />
          </SectionCard>

          <LoadingButton
            variant="contained"
            size="large"
            fullWidth
            onClick={submitConfirmation}
            loading={step === "submitting"}
          >
            {step === "submitting" ? "Saving…" : "Sign & acknowledge"}
          </LoadingButton>
        </>
      )}

      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  );
}
