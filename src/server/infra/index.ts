import "server-only";
import { cache } from "react";
// The one place that picks implementations for the ports in ../ports.ts.
// Swap these bindings (e.g. to a MySQL adapter) to change the backing
// services; nothing else in the app imports an adapter directly.
import { ApiError } from "@/lib/errors";
import type {
  AfterResponse,
  AuthGateway,
  FileStorage,
  Messaging,
  OtpGateway,
  OwnerRepositories,
  SystemRepositories,
  TenantRepositories,
  TenantSessionCookie,
} from "@/server/ports";
import { sessionJwtClaims, supabaseAuth } from "@/server/adapters/supabase/auth";
import { supabaseStorage } from "@/server/adapters/supabase/storage";
import { twilioMessaging } from "@/server/adapters/twilio/messaging";
import { twilioOtp } from "@/server/adapters/twilio/otp";
import { twoFactorOtp } from "@/server/adapters/twofactor/otp";
import { env } from "@/server/env";
import {
  drizzleDb,
  drizzleOwnerRepositories,
  drizzleSystemRepositories,
  drizzleTenantRepositories,
} from "@/server/adapters/drizzle";
import { nextTenantCookie } from "@/server/adapters/next/tenantCookie";
import { nextAfterResponse } from "@/server/adapters/next/afterResponse";

// Data goes through the Drizzle adapter (A19); Supabase is sign-in and file
// storage only.

/** Once per request: a page makes several ownerDb() calls, each would verify the JWT again. */
const requestClaims = cache(sessionJwtClaims);

/** Data access as the signed-in owner (the database refuses anyone else). */
export async function ownerDb(): Promise<OwnerRepositories> {
  const claims = await requestClaims();
  // Callers already hold an OwnerContext, so this is a session that ended since that check.
  if (!claims) throw new ApiError(401, "Unauthorized");
  return drizzleOwnerRepositories(drizzleDb(), claims);
}

/** Data access with no owner scope - see SystemRepositories for who may use it. */
export function systemDb(): SystemRepositories {
  return drizzleSystemRepositories(drizzleDb());
}

/**
 * Data access as one signed-in tenant (A32): only their own rows, read-only
 * (the database enforces it). `tenantId` must come from a verified tenant
 * session (getTenantContext), never from the request.
 */
export function tenantDb(tenantId: string): TenantRepositories {
  return drizzleTenantRepositories(drizzleDb(), tenantId);
}

export const auth: AuthGateway = supabaseAuth;

export const tenantCookie: TenantSessionCookie = nextTenantCookie;

export const afterResponse: AfterResponse = nextAfterResponse;

export const storage: FileStorage = supabaseStorage;

export const messaging: Messaging = twilioMessaging;

/** The SMS-code provider OTP_PROVIDER names (A34), picked per call so the environment is read when needed. */
const otpProvider = (): OtpGateway => (env().OTP_PROVIDER === "twofactor" ? twoFactorOtp : twilioOtp);

export const otp: OtpGateway = {
  sendOtp: (phone) => otpProvider().sendOtp(phone),
  checkOtp: (phone, code, reference) => otpProvider().checkOtp(phone, code, reference),
};
