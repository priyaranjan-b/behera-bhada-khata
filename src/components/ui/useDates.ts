"use client";

import { useContext, useMemo } from "react";
import { formatDateKey, formatDateTime, formatDayRange } from "@/lib/dates";
import type { DisplayDateFormat } from "@/lib/types";
import { DateFormatContext } from "./DateFormatProvider";

/** The owner's display format (A36), for a component that hands it on (DataTable, DateField). */
export function useDateFormat(): DisplayDateFormat {
  return useContext(DateFormatContext);
}

/**
 * The date formatters bound to the owner's display format: what every client
 * component uses to show a date (ESLint keeps the bare ones out of the UI).
 */
export function useDates() {
  const format = useContext(DateFormatContext);
  return useMemo(
    () => ({
      format,
      formatDate: (dateKey: string) => formatDateKey(dateKey, format),
      formatDateTime: (instant: Date | string) => formatDateTime(instant, format),
      formatDayRange: (from: string, to: string) => formatDayRange(from, to, format),
    }),
    [format]
  );
}
