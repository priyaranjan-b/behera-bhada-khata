"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Link from "@/components/ui/Link";

/** Button group: full-width stack on phones, a row from `sm`. */
export function ActionStack({ align = "end", children }: { align?: "start" | "end"; children: React.ReactNode }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{ justifyContent: align === "end" ? "flex-end" : "flex-start", width: { xs: "100%", sm: "auto" } }}
    >
      {children}
    </Stack>
  );
}

/**
 * Standard form footer: error Alert, then Cancel (link, or a button with
 * `onCancel`, e.g. to close a dialog) + primary action, right-aligned on
 * desktop and stacked full width (primary on top) on phones.
 * The primary button submits the form unless `onAction` is given.
 */
export function FormActions({
  error,
  cancelHref,
  onCancel,
  cancelLabel = "Cancel",
  submitLabel,
  pendingLabel,
  pending = false,
  disabled = false,
  onAction,
}: {
  error?: string | null;
  cancelHref?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  submitLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  onAction?: () => void;
}) {
  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Stack direction={{ xs: "column-reverse", sm: "row" }} spacing={1.5} sx={{ justifyContent: "flex-end" }}>
        {onCancel ? (
          <Button onClick={onCancel} variant="outlined" size="large" disabled={pending}>
            {cancelLabel}
          </Button>
        ) : cancelHref ? (
          <Button component={Link} href={cancelHref} variant="outlined" size="large">
            {cancelLabel}
          </Button>
        ) : null}
        <Button
          type={onAction ? "button" : "submit"}
          onClick={onAction}
          variant="contained"
          size="large"
          disabled={disabled || pending}
        >
          {pending && pendingLabel ? pendingLabel : submitLabel}
        </Button>
      </Stack>
    </Stack>
  );
}
