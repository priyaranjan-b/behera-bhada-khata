// Request/response shapes of the HTTP API (`src/app/api/**`). Client-safe:
// the server services return these, the API client (`src/lib/api-client`)
// is typed by them, and pages/components render them. Nothing here knows
// which database sits behind the API.
import type * as z from "zod";
import type { MonthlyReport, MonthlyTrendPoint } from "@/lib/domain/reports";
import type { LedgerRow } from "@/lib/domain/tenantLedger";
import type { PeriodLike, TenantBalanceSummary } from "@/lib/domain/allocation";
import type { UnitMix } from "@/lib/domain/tenant";
import type { PeriodStatus, PreferredChannel, TenantStatus, UnitType } from "@/lib/types";
import type {
  uploadTenantDocumentsSchema,
  confirmSchema,
  createAdjustmentSchema,
  createPaymentSchema,
  createPropertySchema,
  createTenantSchema,
  createUnitSchema,
  moveOutSchema,
  updateTenantSchema,
} from "@/lib/validation";

export type RecordType = "payment" | "adjustment";

export interface Created {
  id: string;
}

/** A new pending payment/adjustment. `notified`: the tenant's confirm link was handed to WhatsApp/SMS. */
export interface RecordCreated extends Created {
  /** Whether the tenant was messaged the acknowledge link; null when the owner chose not to send it. */
  notified: boolean | null;
}

/** A resent acknowledge link. */
export interface LinkResent {
  notified: boolean;
}

// ---- /api/auth -------------------------------------------------------------

export interface Session {
  userId: string;
  email?: string;
  /** This account is the rent book's single owner (app_owner). */
  isOwner: boolean;
}

export type MagicLinkResult = { dev: false } | { dev: true; link: string };

/** What the login page needs to know before the owner types anything. */
export interface LoginOptions {
  /** Sign-in links are returned to the browser instead of emailed (local development only). */
  devLogin: boolean;
}

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

// ---- /api/dashboard/properties (sites -> towers -> houses) -------------------

export interface LocationSummary {
  code: string;
  name: string;
  address: string | null;
}

/** A tower; `code` is its permanent property code, e.g. "AC-T1". */
export interface PropertyHeader {
  code: string;
  name: string;
  locationCode: string;
  locationName: string;
}

export interface PropertyCard extends PropertyHeader {
  totalUnits: number;
  occupiedUnits: number;
  residentialUnits: number;
  commercialUnits: number;
}

export interface LocationGroup {
  location: LocationSummary;
  properties: PropertyCard[];
}

/** One tenancy of a house: who, from, to (inclusive; null = still there). */
export interface OccupancyEntry {
  tenantId: string;
  tenantName: string;
  startDate: string;
  endDate: string | null;
}

export interface UnitRow {
  unitCode: string;
  houseNumber: string;
  floor: string | null;
  unitType: UnitType;
  label: string | null;
  isActive: boolean;
  /** Occupying now (or from a future date already booked); null = vacant. */
  currentTenant: { id: string; displayName: string; since: string } | null;
  /** Every tenancy, oldest first. */
  history: OccupancyEntry[];
}

export interface PropertyTenantRow {
  id: string;
  displayName: string;
  contactName: string | null;
  unitMix: UnitMix | null;
  /** This tenant's current houses in this tower. */
  unitCodes: string[];
  phone: string | null;
  monthlyRent: number;
  status: TenantStatus;
}

export interface PropertyDetail {
  property: PropertyHeader;
  units: UnitRow[];
  tenants: PropertyTenantRow[];
}

export interface NewPropertyForm {
  locations: LocationSummary[];
}

/** A vacant, in-use house a tenant can be given. */
export interface AvailableUnit {
  unitCode: string;
  propertyCode: string;
  propertyName: string;
  unitType: UnitType;
  label: string | null;
  floor: string | null;
}

/** Data for the "add tenant" form opened from a tower. */
export interface NewTenantForm {
  property: PropertyHeader;
  availableUnits: AvailableUnit[];
}

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type CreateUnitInput = Omit<z.infer<typeof createUnitSchema>, "propertyCode">;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

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
  unitMix: UnitMix | null;
  /** Current houses (last houses, for a tenant who moved out). */
  unitCodes: string[];
  phone: string | null;
  propertyName: string;
  locationName: string;
  status: TenantStatus;
  movedOutOn: string | null;
  totalOutstanding: number;
  overdueMonths: number;
}

// ---- /api/dashboard/search (top-bar search) ---------------------------------

/** Everything the top-bar search matches on; filtered in the browser (src/lib/domain/search.ts). */
export interface SearchIndex {
  tenants: SearchTenant[];
  units: SearchUnit[];
}

export interface SearchTenant {
  tenantId: string;
  displayName: string;
  name: string;
  businessName: string | null;
  status: TenantStatus;
  /** Current houses (last houses, for a tenant who moved out). */
  unitCodes: string[];
}

export interface SearchUnit {
  unitCode: string;
  /** The register's nickname for the house ("Godown", "Cabin Room"). */
  label: string | null;
  propertyCode: string;
  propertyName: string;
  /** Who holds the house now; null when vacant. */
  occupant: { tenantId: string; displayName: string } | null;
}

export interface TenantPeriod {
  id: string;
  /** yyyy-MM-dd, first of month. */
  periodMonth: string;
  amountDue: number;
  amountAllocated: number;
  status: PeriodStatus;
}

export interface TenantHouse {
  unitCode: string;
  propertyCode: string;
  propertyName: string;
  unitType: UnitType;
  label: string | null;
}

export interface TenantDetail {
  tenant: {
    id: string;
    name: string;
    businessName: string | null;
    displayName: string;
    phone: string | null;
    preferredChannel: PreferredChannel;
    status: TenantStatus;
    leaseStart: string | null;
    /** First month the app bills; null on drafts. */
    billingStart: string | null;
    /** Security deposit held; editable only while a draft. */
    depositAmount: number | null;
    movedOutOn: string | null;
    /** Combined rent in effect this month (or the last one, after a move-out). */
    monthlyRent: number;
    unitMix: UnitMix | null;
    currentUnits: TenantHouse[];
    /** Every tenancy, oldest first. */
    unitHistory: { unitCode: string; startDate: string; endDate: string | null }[];
    rentHistory: { effectiveMonth: string; monthlyAmount: number }[];
  };
  balance: TenantBalanceSummary;
  periods: TenantPeriod[];
  ledger: LedgerRow[];
}

/** Data for the edit form: current values, plus the houses that could be added. */
export interface EditTenantForm {
  tenant: {
    id: string;
    name: string;
    businessName: string | null;
    phone: string | null;
    preferredChannel: PreferredChannel;
    status: TenantStatus;
    leaseStart: string | null;
    /** First month the app bills; null on drafts. */
    billingStart: string | null;
    /** Security deposit held; editable only while a draft. */
    depositAmount: number | null;
    /** 0 while a draft has no rent yet. */
    monthlyRent: number;
    unitCodes: string[];
  };
  /** The tenant's own current houses first, then every vacant one. */
  availableUnits: AvailableUnit[];
  /** ID proof, photo, agreement... oldest first (0011). */
  documents: TenantDocumentView[];
}

/** A file kept on a tenant; opened via apiPaths.dashboard.tenants.document. */
export interface TenantDocumentView {
  id: string;
  documentType: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface TenantDocumentsSaved {
  /** All of the tenant's documents after the upload. */
  documents: TenantDocumentView[];
}

export type UploadTenantDocumentsInput = z.infer<typeof uploadTenantDocumentsSchema>;

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type MoveOutInput = z.infer<typeof moveOutSchema>;

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

export interface CreatedAdjustment extends RecordCreated {
  tenantId: string;
}

// ---- /api/confirm/[token] (tenant-facing, no login) ------------------------

export interface ConfirmView {
  recordType: RecordType;
  /** The tenant has already signed + verified (optional since 0010; the payment counts regardless). */
  acknowledged: boolean;
  isExpired: boolean;
  amount: number;
  date: string;
  mode?: string;
  note: string | null;
  tenantName: string;
  propertyName: string;
  /** The tenant's houses, e.g. ["AC-T1-G01", "AC-T1-G02"]. */
  unitCodes: string[];
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
