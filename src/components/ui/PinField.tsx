"use client";

import { useId, type Ref } from "react";
import TextField from "@mui/material/TextField";
import { CORRECTION_LIMITS } from "@/lib/validation";

/**
 * The corrections PIN input (0039): digits only, masked, at most
 * CORRECTION_LIMITS.pinLength, a numeric keypad on phones. `error` replaces
 * the helper text and is announced. `autoComplete`: "off" to check a PIN,
 * "new-password" when setting one (so a browser doesn't offer the login
 * password).
 */
export default function PinField({
  label = "Corrections PIN",
  value,
  onChange,
  error,
  helperText,
  inputRef,
  autoComplete = "off",
  disabled,
  autoFocus,
}: {
  label?: string;
  value: string;
  onChange: (pin: string) => void;
  error?: string | null;
  helperText?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoComplete?: "off" | "new-password";
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <TextField
      id={id}
      inputRef={inputRef}
      label={label}
      type="password"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, CORRECTION_LIMITS.pinLength))}
      required
      fullWidth
      disabled={disabled}
      autoFocus={autoFocus}
      error={Boolean(error)}
      helperText={error || helperText}
      slotProps={{
        htmlInput: { inputMode: "numeric", pattern: "[0-9]*", autoComplete, maxLength: CORRECTION_LIMITS.pinLength },
        formHelperText: error ? { role: "alert" } : undefined,
      }}
    />
  );
}
