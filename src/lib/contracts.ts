// Request/response shapes of the HTTP API (`src/app/api/**`). Client-safe:
// the server services return these, the API client (`src/lib/api-client`)
// is typed by them, and pages/components render them. Nothing here knows
// which database sits behind the API.
import type * as z from "zod";
import type { MonthlyReport, MonthlyTrendPoint } from "@/lib/reports";
import type { LedgerRow } from "@/lib/tenantLedger";
import type { PeriodLike, TenantBalanceSummary } from "@/lib/allocation";
import type { LedgerStatus, PeriodStatus, TenantStatus, UnitType } from "@/lib/types";
import type {
  confirmSchema,
  createAdjustmentSchema,
  createPaymentSchema,
  createPropertySchema,
  createTenantSchema,
} from "@/lib/validation";

export type RecordType = "payment" | "adjustment";

export interface Created {
  id: string;
}

// ---- /api/auth -------------------------------------------------------------

export interface Session {
  userId: string;
  email?: string;
}

export type MagicLinkResult = { dev: false } | { dev: true; link: string };

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

// ---- /api/dashboard --------------------------------------------------------

export interface DashboardSummary {
  /** First of the reported month, yyyy-MM-dd. */
  monthKey: string;
  report: MonthlyReport;
  trend: MonthlyTrendPoint[];
}

// ---- /api/dashboard/properties ---------------------------------------------

export interface PropertyHeader {
  id: string;
  name: string;
  address: string | null;
}

export interface PropertyCard extends PropertyHeader {
  residentialTenants: number;
  commercialTenants: number;
}

export interface PropertyTenantRow {
  id: string;
  displayName: string;
  contactName: string | null;
  unitType: UnitType;
  unitLabel: string;
  phone: string;
  monthlyRent: number;
  status: TenantStatus;
}

export interface PropertyDetail {
  property: PropertyHeader;
  tenants: PropertyTenantRow[];
}

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type CreateTenantInput = Omit<z.infer<typeof createTenantSchema>, "propertyId">;

export interface BulkCreateResult {
  created: number;
  /** `rowNumber` is 1-based into the submitted array. */
  failed: { rowNumber: number; error: string }[];
}

// ---- /api/dashboard/tenants ------------------------------------------------

export interface TenantSearchRow {
  tenantId: string;
  displayName: string;
  contactName: string | null;
  businessName: string | null;
  unitType: UnitType;
  unitLabel: string;
  phone: string;
  propertyName: string;
  propertyAddress: string;
  totalOutstanding: number;
  overdueMonths: number;
}

export interface TenantPeriod {
  id: string;
  /** yyyy-MM-dd, first of month. */
  periodMonth: string;
  amountDue: number;
  amountAllocated: number;
  status: PeriodStatus;
}

export interface TenantDetail {
  tenant: {
    id: string;
    name: string;
    businessName: string | null;
    displayName: string;
    unitType: UnitType;
    unitLabel: string;
    phone: string;
    monthlyRent: number;
    propertyId: string;
    propertyName: string;
  };
  balance: TenantBalanceSummary;
  periods: TenantPeriod[];
  ledger: LedgerRow[];
}

export interface NewPaymentForm {
  tenantId: string;
  tenantName: string;
  /** Periods with something still owed, oldest first. */
  openPeriods: PeriodLike[];
}

export type CreatePaymentInput = Omit<z.infer<typeof createPaymentSchema>, "tenantId">;

// ---- /api/dashboard/payments & /api/dashboard/adjustments ------------------

export interface AdjustablePeriod {
  rentPeriodId: string;
  periodMonth: string;
  originallyAllocated: number;
}

export interface AdjustPaymentForm {
  paymentId: string;
  tenantId: string;
  tenantName: string | null;
  amount: number;
  paymentDate: string;
  periods: AdjustablePeriod[];
}

export type CreateAdjustmentInput = Omit<z.infer<typeof createAdjustmentSchema>, "originalPaymentId">;

export interface CreatedAdjustment extends Created {
  tenantId: string;
}

export interface ResendInput {
  tenantId: string;
  amount: number;
}

// ---- /api/confirm/[token] (tenant-facing, no login) ------------------------

export interface ConfirmView {
  recordType: RecordType;
  status: LedgerStatus;
  isExpired: boolean;
  amount: number;
  date: string;
  mode?: string;
  note: string | null;
  tenantName: string;
  propertyName: string;
  maskedPhone: string;
  lineItems: { label: string; amount: number; rentPeriodId: string }[];
}

export interface OtpSent {
  maskedPhone: string;
}

export type ConfirmInput = Omit<z.infer<typeof confirmSchema>, "token">;

export interface Confirmed {
  receiptUrl: string;
}
