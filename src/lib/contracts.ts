// Request/response shapes of the HTTP API (`src/app/api/**`). Client-safe:
// the server services return these, the API client (`src/lib/api-client`)
// is typed by them, and pages/components render them. Nothing here knows
// which database sits behind the API.
import type * as z from "zod";
import type { AgingGroup, MonthlyReport, MonthlyTrendPoint, TenantAging } from "@/lib/domain/reports";
import type { KindBreakdown, SiteCollection } from "@/lib/domain/overview";
import type { BillingTotals } from "@/lib/domain/billing";
import type { LedgerRow } from "@/lib/domain/tenantLedger";
import type { PeriodLike, TenantBalanceSummary } from "@/lib/domain/allocation";
import type { UnitMix } from "@/lib/domain/tenant";
import type { AuditCategory } from "@/lib/domain/audit";
import type {
  AuditAction,
  AuditActorKind,
  PaymentMode,
  PeriodStatus,
  PreferredChannel,
  RecordType,
  TenantKind,
  TenantStatus,
  UnitType,
} from "@/lib/types";
import type {
  uploadTenantDocumentsSchema,
  confirmSchema,
  createAdjustmentSchema,
  createPaymentSchema,
  createPropertySchema,
  createTenantSchema,
  createUnitSchema,
  moveOutSchema,
  correctPaidThroughSchema,
  startRentTrackingSchema,
  billingQuerySchema,
  ownerProfileSchema,
  updateTenantSchema,
} from "@/lib/validation";

export type { RecordType };

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

/** Signed in: where to go next (already checked by safeNext). */
export interface PasswordSignInResult {
  next: string;
}

export interface ChangePasswordInput {
  password: string;
  confirmPassword: string;
}

/** What the login page needs to know before the owner types anything. */
export interface LoginOptions {
  /** Sign-in links are returned to the browser instead of emailed (local development only). */
  devLogin: boolean;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

// ---- /api/dashboard/overview/* (one section of the Overview each, A12) ------

/** /overview/month: the selected month's figures, per tenant, site and tenant type. */
export interface OverviewMonth {
  /** First of the reported month, yyyy-MM-dd. */
  monthKey: string;
  report: MonthlyReport;
  /** The selected month per site. */
  sites: SiteCollection[];
  /** The selected month by tenant type. */
  kinds: KindBreakdown[];
}

/** /overview/trend: billed vs collected for the last few months, up to this one. */
export interface OverviewTrend {
  trend: MonthlyTrendPoint[];
}

/** /overview/houses: in-use houses (retired ones left out) and how many have nobody in them today. */
export interface HouseCounts {
  total: number;
  vacant: number;
}

/** Government rent paid direct (A11): whether any exists, and whether this report includes it. */
export interface PaidDirectState {
  available: boolean;
  shown: boolean;
}

export interface PortfolioFacts {
  /** This month's combined rent of every current tenant, government rent paid direct included. */
  rentRoll: number;
  /** Security deposits of current and draft tenants. */
  depositsHeld: number;
  /** Paid towards months after this one. */
  advancePaid: number;
  /** The part of the rent roll that is government rent paid to the owner directly (A11). */
  paidDirectRent: number;
}

// ---- /api/dashboard/billing (rent billed per month, and what paid it) ------

export interface BillingPayment {
  paymentId: string;
  receiptNo: string | null;
  /** yyyy-MM-dd */
  paymentDate: string;
  mode: PaymentMode;
  /** The part of the payment that went to this month. */
  amount: number;
}

/** One tenant's rent for one month. */
export interface BillingRow {
  /** The rent month's id. */
  id: string;
  tenantId: string;
  tenantName: string;
  propertyName: string;
  unitCodes: string[];
  /** yyyy-MM-01 */
  periodMonth: string;
  /** "October 2026", formatted on the server so it matches at hydration. */
  monthLabel: string;
  amountDue: number;
  amountAllocated: number;
  balance: number;
  status: PeriodStatus;
  /** This month or later: billed ahead, not owed yet. */
  notYetDue: boolean;
  /** Payments that went to this month, oldest first. */
  payments: BillingPayment[];
  /** Government rent paid to the owner directly (0016): counted as billed and collected, no payment record. */
  paidDirect: boolean;
}

export interface BillingReport {
  /** The range shown, month keys (both ends included). */
  from: string;
  to: string;
  /** The month the page opens on: the latest month that has fallen due (this month). */
  latestMonth: string;
  rows: BillingRow[];
  totals: BillingTotals;
  /**
   * Money received in the range's calendar months, whatever months it paid
   * for (cash view): recorded payments, plus government rent paid direct for
   * those months up to this one.
   */
  received: { amount: number; payments: number; paidDirect: number };
  paidDirect: PaidDirectState;
}

export type BillingQuery = z.input<typeof billingQuerySchema>;

// ---- /api/dashboard/defaulters (tenants behind on rent, by months) -----------

export interface DefaulterRow extends TenantAging {
  tenantId: string;
  displayName: string;
  /** The person, when displayName is a business. */
  contactName: string | null;
  phone: string | null;
  propertyName: string;
  /** Current houses (last houses, for a tenant who moved out). */
  unitCodes: string[];
  movedOut: boolean;
  /** Rent in effect now (the last rent, for a tenant who moved out). */
  monthlyRent: number;
  /** Date of the latest payment, yyyy-MM-dd, or null if none was recorded. */
  lastPaymentDate: string | null;
}

export interface DefaultersReport {
  /** The last month counted (the month before this one), yyyy-MM-01. */
  asOfMonth: string;
  totalOutstanding: number;
  /** Tenants by months behind. */
  groups: AgingGroup[];
  /** Most months behind first (compareAging). */
  rows: DefaulterRow[];
}

// ---- /api/dashboard/profile (the owner's name and saved signature) -----------

export interface OwnerProfileView {
  /** null until the profile is first saved. */
  firstName: string | null;
  lastName: string | null;
  /** Who signs receipts on the owner's behalf; null = the owner. */
  signatureName: string | null;
  /** The login account. */
  email: string | null;
  /** "Ramesh Sahu", or null without a profile. */
  displayName: string | null;
  /** Short-lived URL of the saved signature, if any. */
  signatureUrl: string | null;
}

export type UpdateOwnerProfileInput = z.input<typeof ownerProfileSchema>;

/** The signature a payment/adjustment form can use instead of drawing one. */
export interface SavedSignature {
  url: string;
  /** Printed under it on the receipt. */
  signerName: string;
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
  /** This month's rent from the current occupants (a tenant across towers is split by house); rent not tracked here (0016) is left out. */
  monthlyRent: number;
}

export interface LocationGroup {
  location: LocationSummary;
  properties: PropertyCard[];
  /** The site's towers' monthlyRent added up. */
  monthlyRent: number;
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
  /** The tower, e.g. "AC-T1", and its name / site name - for tables across towers. */
  propertyCode: string;
  propertyName: string;
  locationName: string;
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
  tenantKind: TenantKind;
  /** False: government rent paid to the owner directly, not tracked here (0016). */
  rentTracked: boolean;
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

/** /dashboard/tenants/new: add a tenant without starting from a tower. */
export interface AnyTowerTenantForm {
  availableUnits: AvailableUnit[];
}

/** /dashboard/houses/new: add a house, choosing its tower on the form. */
export interface NewHouseForm {
  towers: PropertyHeader[];
}

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type CreateUnitInput = Omit<z.infer<typeof createUnitSchema>, "propertyCode">;
export type CreateTenantInput = z.input<typeof createTenantSchema>;

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
  /** Combined rent in effect now (the last rent after a move-out); 0 when none is set (drafts). */
  monthlyRent: number;
  phone: string | null;
  propertyName: string;
  locationName: string;
  status: TenantStatus;
  tenantKind: TenantKind;
  /** False: government rent paid to the owner directly, not tracked here (0016). */
  rentTracked: boolean;
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
    tenantKind: TenantKind;
    /** False: government rent paid to the owner directly - no months, no dues (0016). */
    rentTracked: boolean;
    leaseStart: string | null;
    /** First month the app bills; null on drafts and while rent isn't tracked. */
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
  /** A tracked government tenant with nothing recorded yet: rent tracking can still be turned off. */
  canStopRentTracking: boolean;
  /** False until Twilio is configured: tenants can't be sent links or OTP codes yet. */
  tenantMessaging: boolean;
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
    tenantKind: TenantKind;
    rentTracked: boolean;
    leaseStart: string | null;
    /** First month the app bills; null on drafts and while rent isn't tracked. */
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

export type CorrectPaidThroughInput = z.input<typeof correctPaidThroughSchema>;
export type StartRentTrackingInput = z.input<typeof startRentTrackingSchema>;

export interface NewPaymentForm {
  tenantId: string;
  tenantName: string;
  /** Periods with something still owed, oldest first. */
  openPeriods: PeriodLike[];
  savedSignature: SavedSignature | null;
  /** False until Twilio is configured: tenants can't be sent links or OTP codes yet. */
  tenantMessaging: boolean;
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
  savedSignature: SavedSignature | null;
  /** False until Twilio is configured: tenants can't be sent links or OTP codes yet. */
  tenantMessaging: boolean;
}

export type CreateAdjustmentInput = Omit<z.infer<typeof createAdjustmentSchema>, "originalPaymentId">;

export interface CreatedAdjustment extends RecordCreated {
  tenantId: string;
}

// ---- /api/confirm/[token] (tenant-facing, no login) ------------------------

export interface ConfirmView {
  recordType: RecordType;
  /** 2026/10/001 (ADJ/... for an adjustment), as printed on the receipt. */
  receiptNo: string;
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
  /** False until Twilio is configured: tenants can't be sent links or OTP codes yet. */
  tenantMessaging: boolean;
}

export interface OtpSent {
  maskedPhone: string;
}

export type ConfirmInput = Omit<z.infer<typeof confirmSchema>, "token">;

export interface Confirmed {
  receiptUrl: string;
}

/** One audit_log row (0015), with names resolved for display. */
export interface AuditEntry {
  id: number;
  /** ISO timestamp. */
  at: string;
  /** Entries with the same txId were one change (e.g. a move-out and the months it dropped). */
  txId: number;
  actorKind: AuditActorKind;
  /** "Ramesh Sahu", "Tenant", "System"... */
  actorName: string;
  action: AuditAction;
  entityId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  unitCode: string | null;
  propertyCode: string | null;
  changes: Record<string, [unknown, unknown]>;
  context: Record<string, unknown>;
}

/** A page of history, newest first; pass `nextBefore` as `before` for the next page. */
export interface AuditPage {
  entries: AuditEntry[];
  nextBefore: number | null;
}

/** GET /api/dashboard/activity query: all optional. */
export interface ActivityQuery {
  category?: AuditCategory;
  /** yyyy-MM-dd, inclusive. */
  from?: string;
  to?: string;
  before?: number;
}
