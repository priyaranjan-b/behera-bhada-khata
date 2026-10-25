import * as z from "zod";
import { isDateKey } from "@/lib/dates";
import { AUDIT_CATEGORIES } from "@/lib/domain/audit";
import {
  PAID_DIRECT_VIEWS,
  PAYMENT_MODES,
  PREFERRED_CHANNELS,
  RECORD_TYPES,
  TENANT_KINDS,
  UNIT_TYPES,
  type TenantKind,
} from "@/lib/types";

// Every request body the API accepts, validated by the service that receives
// it (parseInput in src/server/services/context.ts). Client-safe, so forms
// can reuse the same rules.

export const phoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format, e.g. +919876543210");

/** A real yyyy-MM-dd calendar date. */
export const dateKeySchema = z.string().refine(isDateKey, "Use a valid date (yyyy-MM-dd)");

// numeric(12,2): at most 10 digits before the point, and whole paise.
const MAX_AMOUNT = 9_999_999_999.99;
const hasPaiseOnly = (n: number) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6;

const moneySchema = z.coerce
  .number()
  .refine(Number.isFinite, "Enter an amount")
  .refine(hasPaiseOnly, "Use at most 2 decimal places")
  .refine((n) => Math.abs(n) <= MAX_AMOUNT, "Amount is too large");

const positiveMoneySchema = moneySchema.refine((n) => n > 0, "Must be more than zero");
const nonZeroMoneySchema = moneySchema.refine((n) => n !== 0, "Must not be zero");

/** ~150 KB of PNG - far more than a drawn signature needs, small enough to bound uploads. */
export const MAX_SIGNATURE_DATA_URL_LENGTH = 200_000;

export const signaturePngSchema = z
  .string()
  .startsWith("data:image/png;base64,", "Signature must be a PNG")
  .max(MAX_SIGNATURE_DATA_URL_LENGTH, "Signature image is too large");

const optionalText = (max: number) => z.string().trim().max(max).optional();

/** Suggested tenant document types (0011); the owner may type any other. */
export const TENANT_DOCUMENT_TYPES = [
  "ID proof (Aadhaar)",
  "ID proof (PAN)",
  "ID proof (Voter ID)",
  "ID proof (Driving licence)",
  "Passport photo",
  "Rent agreement",
  "Police verification",
  "Business licence / GST",
] as const;

export const tenantDocumentTypeSchema = z
  .string()
  .trim()
  .min(1, "Choose or type what each document is")
  .max(60, "Keep a document type under 60 characters");

/**
 * Payment proof attachments (0009_payment_proofs.sql). One request carries
 * them all, so the total stays under Vercel's 4.5 MB request body limit; the
 * form downscales photos to fit.
 */
export const PROOF_LIMITS = {
  maxFiles: 5,
  maxTotalBytes: 4 * 1024 * 1024,
  /** For the file picker; the server checks the bytes, not the name or type. */
  accept: "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf",
} as const;

/** Shape of a file-upload limit; the schema, the service and the form all read the same one. */
export type FileLimits = { maxFiles: number; maxTotalBytes: number; accept: string };

/**
 * Tenant documents (0011_tenant_documents.sql), per save. Same request-size
 * ceiling as proofs today, but kept separate so the two can change apart.
 */
export const DOCUMENT_LIMITS: FileLimits = { ...PROOF_LIMITS };

/** One type per uploaded file, in the order the files are sent. */
export const uploadTenantDocumentsSchema = z.object({
  documentTypes: z
    .array(tenantDocumentTypeSchema)
    .min(1, "Choose at least one file")
    .max(DOCUMENT_LIMITS.maxFiles, `Attach at most ${DOCUMENT_LIMITS.maxFiles} documents at a time`),
});

// ---- Auth --------------------------------------------------------------------

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email"));

export const magicLinkSchema = z.object({
  email: emailSchema,
  next: z.string().max(2048).optional(),
});

/** Owner password length (72 = the most bcrypt, and so Supabase Auth, uses). */
export const PASSWORD_LIMITS = { minLength: 8, maxLength: 72 } as const;

export const passwordSignInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(PASSWORD_LIMITS.maxLength),
  next: z.string().max(2048).optional(),
});

export const changePasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_LIMITS.minLength, `Use at least ${PASSWORD_LIMITS.minLength} characters`)
      .max(PASSWORD_LIMITS.maxLength, `Use at most ${PASSWORD_LIMITS.maxLength} characters`),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "The passwords don't match" });

export const sessionTokensSchema = z.object({
  accessToken: z.string().min(1).max(8192),
  refreshToken: z.string().min(1).max(8192),
});

// ---- Sites, towers, houses & tenants ----------------------------------------
// Codes match the CHECK constraints in 0006_property_master_data.sql and are
// upper-cased on the way in, so "ac-t1-g01" works too.

const upperCode = (pattern: RegExp, message: string) =>
  z.string().trim().toUpperCase().regex(pattern, message);

export const locationCodeSchema = upperCode(/^[A-Z]{2,4}$/, "Site code: 2-4 letters, e.g. AC");
export const towerCodeSchema = upperCode(/^T[A-Z0-9]{1,3}$/, "Tower code: T followed by 1-3 letters/digits, e.g. T1");
export const propertyCodeSchema = upperCode(/^[A-Z]{2,4}-T[A-Z0-9]{1,3}$/, "Tower code looks like AC-T1");
export const houseNumberSchema = upperCode(/^[A-Z0-9]{1,4}$/, "House number: 1-4 letters/digits, e.g. G01 or 101");
export const unitCodeSchema = upperCode(/^[A-Z]{2,4}-T[A-Z0-9]{1,3}-[A-Z0-9]{1,4}$/, "House code looks like AC-T1-G01");

export const unitCodesSchema = z
  .array(unitCodeSchema)
  .min(1, "Choose at least one house")
  .max(20, "At most 20 houses per tenant")
  .refine((codes) => new Set(codes).size === codes.length, "Each house can only be chosen once");

const floorSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^(G|B[0-9]?|[0-9]{1,2})$/, "Floor: G, B, or a number")
  .optional();

/** A first-of-month key; "2026-07" is accepted and normalised to "2026-07-01". */
export const monthKeySchema = z
  .string()
  .trim()
  .transform((v) => (/^\d{4}-\d{2}$/.test(v) ? `${v}-01` : v))
  .pipe(dateKeySchema)
  .refine((v) => v.endsWith("-01"), "Use the first of the month");

export const createPropertySchema = z.object({
  locationCode: locationCodeSchema,
  towerCode: towerCodeSchema,
  name: z.string().trim().min(1, "Required").max(200),
});

export const createUnitSchema = z.object({
  propertyCode: propertyCodeSchema,
  houseNumber: houseNumberSchema,
  floor: floorSchema,
  unitType: z.enum(UNIT_TYPES),
  label: optionalText(100),
});

const tenantContact = {
  name: z.string().trim().min(1, "Required").max(200),
  businessName: optionalText(200),
  phone: phoneE164Schema,
  preferredChannel: z.enum(PREFERRED_CHANNELS),
};

/**
 * Only a government tenant may leave the phone empty or its rent untracked
 * (0016). An edit that doesn't send the kind keeps the stored one, which the
 * database checks.
 */
function checkGovernmentOnly(
  input: { tenantKind?: TenantKind; phone?: string; rentTracked?: boolean },
  ctx: z.RefinementCtx,
  { phoneRequired }: { phoneRequired: boolean }
) {
  if (input.tenantKind === undefined || input.tenantKind === "government") return;
  if (phoneRequired && !input.phone) ctx.addIssue({ code: "custom", path: ["phone"], message: "Required" });
  if (input.rentTracked === false) {
    ctx.addIssue({
      code: "custom",
      path: ["rentTracked"],
      message: "Only a government tenant's rent can be left untracked",
    });
  }
}

/**
 * One tenant, the houses they take on `leaseStart`, and their combined monthly
 * rent. A government tenant may have no phone, and with `rentTracked: false`
 * is never billed (the rent is then optional, the agreement rent).
 */
export const createTenantSchema = z
  .object({
    ...tenantContact,
    tenantKind: z.enum(TENANT_KINDS).default("individual"),
    phone: phoneE164Schema.optional(),
    rentTracked: z.boolean().default(true),
    monthlyRentAmount: positiveMoneySchema.optional(),
    leaseStart: dateKeySchema,
    unitCodes: unitCodesSchema,
    /** Rent already settled outside the app up to this month; billing starts the month after. */
    paidThrough: monthKeySchema.optional(),
    /** Security deposit (optional); can't be changed once the tenant is active. */
    depositAmount: positiveMoneySchema.optional(),
  })
  .superRefine((input, ctx) => {
    checkGovernmentOnly(input, ctx, { phoneRequired: true });
    if (input.rentTracked && input.monthlyRentAmount === undefined) {
      ctx.addIssue({ code: "custom", path: ["monthlyRentAmount"], message: "Required" });
    }
  });

/**
 * The full new state of a tenant. The database works out what changed:
 * houses added/removed take effect on `unitsEffective`, a different rent
 * from `rentEffectiveMonth` - each required only when that part changed.
 * A draft (from the paper register) may be saved with details still missing;
 * phone + rent + `leaseStart` together make it active.
 */
export const updateTenantSchema = z
  .object({
    ...tenantContact,
    /** Omitted = unchanged. */
    tenantKind: z.enum(TENANT_KINDS).optional(),
    phone: phoneE164Schema.optional(),
    unitCodes: unitCodesSchema,
    unitsEffective: dateKeySchema.optional(),
    monthlyRentAmount: positiveMoneySchema.optional(),
    rentEffectiveMonth: monthKeySchema.optional(),
    leaseStart: dateKeySchema.optional(),
    /** Drafts: rent settled on paper up to this month (default: last month). */
    paidThrough: monthKeySchema.optional(),
    /** Drafts only - frozen once active (sending the stored value is fine). */
    depositAmount: positiveMoneySchema.optional(),
    /** Drafts only: false completes a government draft without billing it. */
    rentTracked: z.boolean().optional(),
  })
  .superRefine((input, ctx) => checkGovernmentOnly(input, ctx, { phoneRequired: false }));

export const moveOutSchema = z.object({
  moveOutDate: dateKeySchema,
});

/** The last month rent was paid outside the app (yyyy-MM or yyyy-MM-01). */
export const correctPaidThroughSchema = z.object({
  paidThrough: monthKeySchema,
});

/**
 * Starts billing an untracked government tenant (0016): from the month after
 * `paidThrough` (default: last month). `monthlyRentAmount` is needed unless
 * the agreement rent is already on file.
 */
export const startRentTrackingSchema = z.object({
  monthlyRentAmount: positiveMoneySchema.optional(),
  paidThrough: monthKeySchema.optional(),
});

// ---- Payments & adjustments -------------------------------------------------

export const paymentAllocationInputSchema = z.object({
  rentPeriodId: z.uuid(),
  amountAllocated: positiveMoneySchema,
});

export const createPaymentSchema = z.object({
  tenantId: z.uuid(),
  amount: positiveMoneySchema,
  paymentDate: dateKeySchema,
  mode: z.enum(PAYMENT_MODES),
  note: optionalText(500),
  allocations: z.array(paymentAllocationInputSchema).min(1, "Select at least one period").max(240),
  /** Drawn for this payment; omitted = the saved signature (owner_profile, 0013). */
  ownerSignaturePng: signaturePngSchema.optional(),
  /** Message the tenant a link to acknowledge it (sign + OTP). Default: yes. */
  notifyTenant: z.boolean().optional(),
});

export const adjustmentAllocationInputSchema = z.object({
  rentPeriodId: z.uuid(),
  amountDelta: nonZeroMoneySchema,
});

export const createAdjustmentSchema = z.object({
  originalPaymentId: z.uuid(),
  deltaAmount: nonZeroMoneySchema,
  reason: z.string().trim().min(3, "Explain what's being corrected").max(500),
  allocations: z.array(adjustmentAllocationInputSchema).min(1, "Select at least one period").max(240),
  /** Drawn for this adjustment; omitted = the saved signature (owner_profile, 0013). */
  ownerSignaturePng: signaturePngSchema.optional(),
  /** Message the tenant a link to acknowledge it (sign + OTP). Default: yes. */
  notifyTenant: z.boolean().optional(),
});

// ---- Owner profile (0013) ----------------------------------------------------

/** Trimmed; empty means "not set". */
const optionalName = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const ownerProfileSchema = z.object({
  firstName: z.string().trim().min(1, "Enter the owner's first name").max(60),
  lastName: optionalName(60),
  /** Who signs receipts on the owner's behalf; empty = the owner. */
  signatureName: optionalName(120),
  /** A new saved signature; omit to keep the current one. */
  signaturePng: signaturePngSchema.optional(),
  removeSignature: z.boolean().optional(),
});

// ---- Tenant confirm flow ----------------------------------------------------

export const otpSendSchema = z.object({
  token: z.string().min(1).max(200),
  recordType: z.enum(RECORD_TYPES),
});

export const confirmSchema = z.object({
  token: z.string().min(1).max(200),
  recordType: z.enum(RECORD_TYPES),
  otpCode: z.string().trim().regex(/^\d{4,10}$/, "Enter the code from the SMS"),
  tenantSignaturePng: signaturePngSchema,
});

// ---- Audit history (0015) ----------------------------------------------------

/** Entries per page of history (Activity page, tenant and house timelines). */
export const AUDIT_LIMITS = { pageSize: 50 } as const;

/** `before`: the id to continue below (from AuditPage.nextBefore). Query params arrive as strings. */
export const auditPageSchema = z.object({
  before: z.coerce.number().int().positive().optional(),
});

export const activityQuerySchema = auditPageSchema
  .extend({
    category: z.enum(AUDIT_CATEGORIES).optional(),
    from: dateKeySchema.optional(),
    to: dateKeySchema.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, "The start date must be on or before the end date");

// ---- Billing ------------------------------------------------------------------

/** The Billing page shows at most this many months at once. */
export const BILLING_LIMITS = { maxMonths: 24 } as const;

/** Include government rent paid direct (A11)? Missing or unknown = shown. */
export const paidDirectViewSchema = z.enum(PAID_DIRECT_VIEWS).catch("show").default("show");

const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month (yyyy-MM)");

/** `?from=yyyy-MM&to=yyyy-MM` on /dashboard/billing; either may be missing (defaults in the service). */
export const billingQuerySchema = z.object({
  from: yearMonthSchema.optional(),
  to: yearMonthSchema.optional(),
  paidDirect: paidDirectViewSchema,
});
