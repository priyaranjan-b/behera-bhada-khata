import "server-only";
import { cache } from "react";
import type { DisplaySettingsView } from "@/lib/contracts";
import { ApiError } from "@/lib/errors";
import { DEFAULT_DISPLAY_DATE_FORMAT, type DisplayDateFormat } from "@/lib/types";
import { displaySettingsSchema } from "@/lib/validation";
import { systemDb, tenantDb } from "@/server/infra";
import { enforceRateLimits, parseInput, RATE_LIMITS, type OwnerContext, type RequestMeta, type TenantContext } from "./context";
import { db, dateFormatSetting } from "./loaders";

// How the UI shows dates (0040, D42, A36). Only the UI uses it: no service
// formats a date with it, and SQL, the audit text and receipts keep
// DATE_FORMAT. Read once per request (cache()), and a cosmetic setting never
// takes a page down: only a sign-in refusal (401/403 from the session check)
// passes on; any other failure - an outage, a grant gone missing - logs one
// line and shows the default.

async function orDefault(who: string, read: () => Promise<DisplayDateFormat>): Promise<DisplaySettingsView> {
  try {
    return { dateFormat: await read() };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`display settings read failed, using default (${who}): ${reason}`);
    return { dateFormat: DEFAULT_DISPLAY_DATE_FORMAT };
  }
}

export async function getDisplaySettings(ctx: OwnerContext): Promise<DisplaySettingsView> {
  return orDefault(`owner ${ctx.ownerId}`, dateFormatSetting);
}

/** From the Settings page's Date format card. */
export async function setDisplaySettings(_ctx: OwnerContext, body: unknown): Promise<DisplaySettingsView> {
  const { dateFormat } = parseInput(displaySettingsSchema, body);
  await (await db()).appSettings.setDateFormat(dateFormat);
  return { dateFormat };
}

const tenantDateFormat = cache((tenantId: string) => tenantDb(tenantId).appSettings.getDateFormat());

/** The tenant portal shows dates the way the owner chose. */
export async function getMyDisplaySettings(ctx: TenantContext): Promise<DisplaySettingsView> {
  return orDefault(`tenant ${ctx.tenantId}`, () => tenantDateFormat(ctx.tenantId));
}

const publicDateFormat = cache(() => systemDb().appSettings.getDateFormat());

/**
 * For pages without an owner or tenant session (/tenant/select, a confirm
 * link): the same format. Not sensitive - one setting for the whole rent
 * book. Over HTTP (`meta`) it is rate limited per client; in-process pages
 * read it without a limit (the page itself is the request).
 */
export async function getPublicDisplaySettings(meta?: RequestMeta): Promise<DisplaySettingsView> {
  if (meta) await enforceRateLimits([{ key: `display:ip:${meta.ip}`, ...RATE_LIMITS.publicReadPerIp }]);
  return orDefault("public", publicDateFormat);
}
