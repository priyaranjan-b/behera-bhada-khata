"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Link from "@/components/Link";

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
 * Standard form footer: error Alert, then Cancel (link) + primary action,
 * right-aligned on desktop and stacked full width (primary on top) on phones.
 * The primary button submits the form unless `onAction` is given.
 */
export function FormActions({
  error,
  cancelHref,
  cancelLabel = "Cancel",
  submitLabel,
  pendingLabel,
  pending = false,
  disabled = false,
  onAction,
}: {
  error?: string | null;
  cancelHref?: string;
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
        {cancelHref ? (
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
