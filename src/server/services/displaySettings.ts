import "server-only";
import type { DisplaySettingsView } from "@/lib/contracts";
import { displaySettingsSchema } from "@/lib/validation";
import { tenantDb } from "@/server/infra";
import { parseInput, type OwnerContext, type TenantContext } from "./context";
import { db } from "./loaders";

// How the UI shows dates (0040, D42, A36). Only the UI uses it: no service
// formats a date with it, and SQL, the audit text and receipts keep
// DATE_FORMAT. Read once per request (the cached `db`), however many
// components ask.

export async function getDisplaySettings(_ctx: OwnerContext): Promise<DisplaySettingsView> {
  return { dateFormat: await (await db()).appSettings.getDateFormat() };
}

/** From the Settings page's Date format card. */
export async function setDisplaySettings(_ctx: OwnerContext, body: unknown): Promise<DisplaySettingsView> {
  const { dateFormat } = parseInput(displaySettingsSchema, body);
  await (await db()).appSettings.setDateFormat(dateFormat);
  return { dateFormat };
}

/** The tenant portal shows dates the way the owner chose. */
export async function getMyDisplaySettings(ctx: TenantContext): Promise<DisplaySettingsView> {
  return { dateFormat: await tenantDb(ctx.tenantId).appSettings.getDateFormat() };
}
