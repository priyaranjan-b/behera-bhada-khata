import "server-only";
import { DEFAULT_DISPLAY_DATE_FORMAT, type DisplayDateFormat } from "@/lib/types";
import type { Tx } from "../client";
import { appSettings } from "../schema";

// Rent-book-wide settings (0040, D42): read by the owner, the tenant portal
// (tenant_reader, the date_format column only - 0041) and the public pages
// (service_role); written by the owner under RLS.

/** How the UI shows dates; the default until the owner picks one. */
export async function getDateFormat(tx: Tx): Promise<DisplayDateFormat> {
  const [row] = await tx.select({ dateFormat: appSettings.date_format }).from(appSettings).limit(1);
  return (row?.dateFormat as DisplayDateFormat | undefined) ?? DEFAULT_DISPLAY_DATE_FORMAT;
}

/** Creates or replaces the one row (the check refuses an unknown format: 23514, a 400). */
export async function saveDateFormat(tx: Tx, dateFormat: DisplayDateFormat): Promise<void> {
  await tx
    .insert(appSettings)
    .values({ singleton: true, date_format: dateFormat })
    .onConflictDoUpdate({ target: appSettings.singleton, set: { date_format: dateFormat } });
}
