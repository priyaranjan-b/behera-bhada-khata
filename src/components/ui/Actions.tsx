"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import LinkButton from "@/components/ui/Loading/LinkButton";
import LoadingButton from "@/components/ui/Loading/LoadingButton";

/**
 * Button group: a row from `sm`. On phones, `phone="stack"` stacks every
 * button full width; `phone="primaryOnTop"` puts the last button (the
 * primary, right-most on desktop) full width on top and pairs the rest two
 * to a row below it.
 */
export function ActionStack({
  align = "end",
  phone = "stack",
  children,
}: {
  align?: "start" | "end";
  phone?: "stack" | "primaryOnTop";
  children: React.ReactNode;
}) {
  if (phone === "primaryOnTop") {
    return (
      <Box
        sx={{
          display: { xs: "grid", sm: "flex" },
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 1.5,
          justifyContent: align === "end" ? "flex-end" : "flex-start",
          width: { xs: "100%", sm: "auto" },
          "& > :last-child": { gridColumn: "1 / -1", order: { xs: -1, sm: 0 } },
          "& > *": { width: { xs: "100%", sm: "auto" } },
        }}
      >
        {children}
      </Box>
    );
  }
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
          <LinkButton href={cancelHref} variant="outlined" size="large" disabled={pending}>
            {cancelLabel}
          </LinkButton>
        ) : null}
        <LoadingButton
          type={onAction ? "button" : "submit"}
          onClick={onAction}
          variant="contained"
          size="large"
          disabled={disabled}
          loading={pending}
          loadingPosition="start"
        >
          {pending && pendingLabel ? pendingLabel : submitLabel}
        </LoadingButton>
      </Stack>
    </Stack>
  );
}
