"use client";

import { createContext } from "react";
import { DEFAULT_DISPLAY_DATE_FORMAT, type DisplayDateFormat } from "@/lib/types";

/**
 * How the UI shows dates (0040, A36): the owner's choice from Settings,
 * passed in by the layout (read on the server, so the first render is
 * already right). Only the UI uses it; services, SQL text and receipts keep
 * DATE_FORMAT. Read it with useDates / useDateFormat.
 */
export const DateFormatContext = createContext<DisplayDateFormat>(DEFAULT_DISPLAY_DATE_FORMAT);

export function DateFormatProvider({ format, children }: { format: DisplayDateFormat; children: React.ReactNode }) {
  return <DateFormatContext.Provider value={format}>{children}</DateFormatContext.Provider>;
}
