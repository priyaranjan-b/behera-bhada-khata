"use client";

import type { ReactNode } from "react";
import Stack from "@mui/material/Stack";
import type { SxProps, Theme } from "@mui/material/styles";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { DATE_FORMAT, formatDateKey } from "@/lib/dates";
import { boundOf, usePickerValue } from "./pickerValue";
import QuickPicks from "./QuickPicks";

export interface DateFieldProps {
  label: string;
  /** yyyy-MM-dd, or "" when empty (also while a date is half typed). */
  value: string;
  onChange: (dateKey: string) => void;
  /** Earliest / latest selectable day, yyyy-MM-dd. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: "small" | "medium";
  helperText?: ReactNode;
  id?: string;
  sx?: SxProps<Theme>;
  /** One-tap days under the field ("Today", "Yesterday"); the one matching the value shows selected. */
  quickPicks?: { label: string; value: string }[];
}

/**
 * Every date input in the app: typed and shown as DATE_FORMAT (dd/MM/yyyy,
 * src/lib/dates.ts) in every browser, with a calendar to pick from. Never use
 * a native `type="date"` field (ESLint refuses it).
 */
export default function DateField({
  label,
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  fullWidth,
  size,
  helperText,
  id,
  sx,
  quickPicks,
}: DateFieldProps) {
  const picker = usePickerValue(value, onChange, "YYYY-MM-DD");
  const field = (
    <DatePicker
      label={label}
      {...picker}
      format={DATE_FORMAT}
      minDate={boundOf(min)}
      maxDate={boundOf(max)}
      disabled={disabled}
      sx={sx}
      slotProps={{ textField: { id, required, fullWidth, size, helperText } }}
    />
  );
  if (!quickPicks?.length) return field;
  return (
    <Stack spacing={1}>
      {field}
      <QuickPicks
        disabled={disabled}
        picks={quickPicks.map((pick) => ({
          label: pick.label,
          ariaLabel: `${label}: ${pick.label}, ${formatDateKey(pick.value)}`,
          selected: pick.value === value,
        }))}
        onPick={(index) => onChange(quickPicks[index].value)}
      />
    </Stack>
  );
}
