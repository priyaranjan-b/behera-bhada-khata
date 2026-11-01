"use client";

import type { ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { MONTH_FORMAT } from "@/lib/dates";
import { boundOf, usePickerValue } from "./pickerValue";

export interface MonthFieldProps {
  label: string;
  /** yyyy-MM (as `yearMonthOf`; `monthKeyOf` turns it into a month key), or "" when empty. */
  value: string;
  onChange: (yearMonth: string) => void;
  /** Earliest / latest selectable month, yyyy-MM. */
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: "small" | "medium";
  helperText?: ReactNode;
  id?: string;
  sx?: SxProps<Theme>;
}

/** Every month input in the app ("Nov 2026"); never a native `type="month"` field. */
export default function MonthField({ label, value, onChange, min, max, required, disabled, fullWidth, size, helperText, id, sx }: MonthFieldProps) {
  const picker = usePickerValue(value, onChange, "YYYY-MM");
  return (
    <DatePicker
      label={label}
      {...picker}
      views={["year", "month"]}
      openTo="month"
      format={MONTH_FORMAT}
      minDate={boundOf(min)}
      maxDate={boundOf(max)}
      disabled={disabled}
      sx={sx}
      slotProps={{ textField: { id, required, fullWidth, size, helperText } }}
    />
  );
}
