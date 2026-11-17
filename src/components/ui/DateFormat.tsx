"use client";

import { createContext, useContext, useMemo } from "react";
import { formatDateKey, formatDateTime, formatDayRange } from "@/lib/dates";
import { DEFAULT_DISPLAY_DATE_FORMAT, type DisplayDateFormat } from "@/lib/types";

/**
 * How the UI shows dates (0040, A36): the owner's choice from Settings,
 * passed in by the layout (read on the server, so the first render is
 * already right). Only the UI uses it; services, SQL text and receipts keep
 * DATE_FORMAT.
 */
const DateFormatContext = createContext<DisplayDateFormat>(DEFAULT_DISPLAY_DATE_FORMAT);

export function DateFormatProvider({ format, children }: { format: DisplayDateFormat; children: React.ReactNode }) {
  return <DateFormatContext.Provider value={format}>{children}</DateFormatContext.Provider>;
}

/** The display format, for a server-safe component that's given it as a prop. */
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
