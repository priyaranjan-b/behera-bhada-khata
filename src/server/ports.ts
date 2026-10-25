// The backend's outside-world dependencies, as interfaces. Services depend
// only on these; `src/server/infra/index.ts` binds them to an implementation
// (today: src/server/adapters/supabase and src/server/adapters/twilio).
// Moving to another database or a standalone Node.js server means writing a
// new adapter that satisfies these interfaces - services and route handlers
// stay as they are.
import type {
  Adjustment,
  AppAuditAction,
  AuditAction,
  AuditActorKind,
  AuditLogEntry,
  AdjustmentAllocation,
  Database,
  LedgerStatus,
  Location,
  OwnerProfile,
  Payment,
  PaymentAllocation,
  PaymentProof,
  PreferredChannel,
  ProofArg,
  Property,
  RentPeriod,
  Tenant,
  TenantDocument,
  TenantKind,
  TenantRentRate,
  TenantStatus,
  Unit,
  UnitOccupancy,
  UnitType,
} from "@/lib/types";
import type { Session } from "@/lib/contracts";

type Insert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];

export interface NewProperty {
  property_code: string;
  location_code: string;
  name: string;
}

export interface NewUnit {
  unit_code: string;
  property_code: string;
  floor: string | null;
  unit_type: UnitType;
  label: string | null;
}

/** A tenant plus the houses they move into on lease_start, for one combined rent. */
export interface NewTenant {
  name: string;
  business_name: string | null;
  /** Optional only for a government tenant. */
  phone: string | null;
  preferred_channel: PreferredChannel;
  /** Optional only when `rent_tracked` is false (the agreement rent). */
  monthly_rent: number | null;
  lease_start: string;
  unit_codes: string[];
  /** Rent settled outside the app up to this month; null = bill from the lease month. */
  paid_through: string | null;
  /** Security deposit, fixed from creation. */
  deposit_amount: number | null;
  tenant_kind: TenantKind;
  /** false: government rent paid to the owner directly - never billed (0016). */
  rent_tracked: boolean;
}

/**
 * Edits to a tenant. `unit_codes: null` = houses unchanged; otherwise the
 * full new set, effective `units_effective`. `monthly_rent: null` = rent
 * unchanged; otherwise effective from `rent_effective_month` (first of month).
 */
export interface TenantChanges {
  name: string;
  business_name: string | null;
  /** Required for an active tenant; a draft may leave it empty. */
  phone: string | null;
  preferred_channel: PreferredChannel;
  unit_codes: string[] | null;
  units_effective: string | null;
  monthly_rent: number | null;
  rent_effective_month: string | null;
  /** Drafts only: with phone + rent, makes the draft active from this date. */
  lease_start: string | null;
  /** Drafts only: rent settled on paper up to this month; null = last month. */
  paid_through: string | null;
  /** A draft's deposit (null clears it); for an active tenant null or the stored value, else 409. */
  deposit_amount: number | null;
  /** null = unchanged. A tenant whose rent isn't tracked must stay government (409). */
  tenant_kind: TenantKind | null;
  /** Drafts only: false completes a government draft untracked; null = tracked. */
  rent_tracked: boolean | null;
}
export type NewPayment = Omit<Insert<"payments">, "created_at" | "status" | "amount"> & {
  id: string;
  amount: number;
  owner_signature_path: string;
};
export type NewAdjustment = Omit<
  Insert<"adjustments">,
  "created_at" | "status" | "tenant_id" | "delta_amount"
> & { id: string; delta_amount: number; owner_signature_path: string };

/** One allocation of a new payment (amount > 0) or adjustment (signed, non-zero) onto a rent period. */
export interface NewAllocation {
  rent_period_id: string;
  amount: number;
}

/** A proof file already uploaded under the payment's folder (`<folder>/proofs/...`). */
export type NewPaymentProof = ProofArg;

/** Columns written when a tenant acknowledges a payment/adjustment (optional; 0010). */
export interface AcknowledgementPatch {
  tenant_signature_path: string;
  pdf_path: string;
  otp_verified_at: string;
}

/** Which audit entries to read: newest first, `beforeId` for the next page. */
export interface AuditFilter {
  tenantId?: string;
  unitCode?: string;
  propertyCode?: string;
  actions?: readonly AuditAction[];
  /** yyyy-MM-dd, inclusive, in the app time zone. */
  fromDate?: string;
  toDate?: string;
  beforeId?: number;
  limit: number;
}

/** An app-level event for log_event (0015). Never a secret, OTP, signature or raw IP. */
export interface AuditEvent {
  action: AppAuditAction;
  tenantId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  context?: Record<string, string | number | boolean | null>;
}

// ---- The owner's data (an implementation must refuse anyone but the single app owner) ----

export interface OwnerRepositories {
  /** History of every change (0015): read-only, plus the owner's own app events. */
  audit: {
    list(filter: AuditFilter): Promise<AuditLogEntry[]>;
    log(event: AuditEvent): Promise<void>;
  };
  /** The owner's name (0013): one row. */
  ownerProfile: {
    get(): Promise<OwnerProfile | null>;
    /** Creates or replaces the row. */
    save(profile: Pick<OwnerProfile, "first_name" | "last_name" | "signature_name" | "signature_path">): Promise<void>;
  };
  locations: {
    /** By code. */
    list(): Promise<Location[]>;
  };
  properties: {
    /** By code. */
    list(): Promise<Property[]>;
    get(propertyCode: string): Promise<Property | null>;
    create(input: NewProperty): Promise<void>;
  };
  units: {
    /** By code. */
    list(filter?: { propertyCode?: string; unitCodes?: string[] }): Promise<Unit[]>;
    create(input: NewUnit): Promise<void>;
  };
  /** Who occupies (occupied) which house, when - oldest tenancy first. */
  occupancy: {
    list(filter?: { tenantIds?: string[]; propertyCode?: string }): Promise<UnitOccupancy[]>;
  };
  /** Files kept on a tenant (0011): added and deleted, never edited. */
  tenantDocuments: {
    /** Oldest first. */
    list(tenantId: string): Promise<TenantDocument[]>;
    get(id: string): Promise<TenantDocument | null>;
    create(rows: Insert<"tenant_documents">[]): Promise<void>;
    /** False if no such document. */
    remove(id: string): Promise<boolean>;
  };
  rentRates: {
    /** Ordered by effective_month ascending. */
    listForTenants(tenantIds: string[]): Promise<TenantRentRate[]>;
  };
  tenants: {
    /** Oldest first. */
    list(filter?: { status?: TenantStatus }): Promise<Tenant[]>;
    get(id: string): Promise<Tenant | null>;
    /**
     * Tenant, first rent rate and tenancies in one transaction. Rejects
     * (400/409) houses that don't exist, are retired, or are occupied.
     */
    create(input: NewTenant): Promise<{ id: string }>;
    /** Contact details, house set and combined rent - see TenantChanges. */
    update(id: string, changes: TenantChanges): Promise<void>;
    /** Ends every tenancy on `date`, marks the tenant inactive and drops untouched later months. */
    moveOut(id: string, date: string): Promise<void>;
    /**
     * Fixes an active tenant's "rent paid up to" (0014): billing starts the
     * month after. Earlier adds the months as owed; later drops months, 409
     * if one has a payment. Returns the new billing start.
     */
    correctPaidThrough(id: string, paidThrough: string): Promise<string>;
    /**
     * Starts billing an untracked government tenant (0016) from the month
     * after `paidThrough` (null = last month). Returns the billing start.
     */
    startRentTracking(id: string, monthlyRent: number | null, paidThrough: string | null): Promise<string>;
    /** Undoes startRentTracking; 409 once a payment or adjustment is recorded. */
    stopRentTracking(id: string): Promise<void>;
  };
  rentPeriods: {
    /**
     * Ordered by period_month ascending. `openOnly`: only periods with
     * something still owed. `openOrFrom` (a month key): those, plus every
     * period from that month on - what a dashboard needs, without loading
     * years of settled history.
     */
    listForTenants(tenantIds: string[], filter?: { openOnly?: boolean; openOrFrom?: string }): Promise<RentPeriod[]>;
    listByIds(ids: string[]): Promise<RentPeriod[]>;
  };
  payments: {
    /** `fromDate` (yyyy-MM-dd): only payments dated on or after it. */
    listForTenants(tenantIds: string[], filter?: { status?: LedgerStatus; fromDate?: string }): Promise<Payment[]>;
    get(id: string): Promise<Payment | null>;
    /**
     * Inserts the pending payment and its allocations atomically. Rejects
     * (ApiError 400) allocations that don't sum to the amount, belong to
     * another tenant, or exceed what's still owed on a period, and proofs
     * stored outside the payment's own folder.
     */
    create(payment: NewPayment, allocations: NewAllocation[], proofs?: NewPaymentProof[]): Promise<void>;
    listAllocations(paymentId: string): Promise<PaymentAllocation[]>;
    /** Proof files of these payments, in the order they were attached. */
    listProofs(paymentIds: string[]): Promise<PaymentProof[]>;
    getProof(proofId: string): Promise<PaymentProof | null>;
    /**
     * Replaces the confirm-link token of a payment the tenant hasn't
     * acknowledged yet; never touches ledger facts. False otherwise.
     */
    rotateToken(id: string, tokenHash: string, expiresAt: string): Promise<boolean>;
  };
  adjustments: {
    /** `fromDate` (yyyy-MM-dd): only adjustments confirmed on or after it. */
    listForTenants(tenantIds: string[], filter?: { status?: LedgerStatus; fromDate?: string }): Promise<Adjustment[]>;
    get(id: string): Promise<Adjustment | null>;
    /**
     * Inserts the pending adjustment and its allocations atomically. Rejects
     * (ApiError 400) allocations outside the original payment's periods, not
     * summing to the delta, or pushing a period outside [0, amount_due].
     * The tenant is taken from the original payment.
     */
    create(adjustment: NewAdjustment, allocations: NewAllocation[]): Promise<void>;
    listAllocations(adjustmentId: string): Promise<AdjustmentAllocation[]>;
    rotateToken(id: string, tokenHash: string, expiresAt: string): Promise<boolean>;
  };
}

// ---- System access (bypasses the owner check) - only for flows that authorize some other way:
// the tenant confirm link (possession of the token), rent-period upkeep, rate limits and cron. ----

export interface SystemRepositories {
  audit: {
    /** Logs an event for someone without an owner session (the tenant, a failed sign-in) or the system. */
    log(event: AuditEvent & { actorKind: AuditActorKind; actorId?: string | null }): Promise<void>;
  };
  locations: {
    get(locationCode: string): Promise<Location | null>;
  };
  properties: {
    get(propertyCode: string): Promise<Property | null>;
  };
  tenants: {
    get(id: string): Promise<Tenant | null>;
  };
  occupancy: {
    /** A tenant's tenancies, oldest first. */
    listForTenant(tenantId: string): Promise<UnitOccupancy[]>;
  };
  rentPeriods: {
    listByIds(ids: string[]): Promise<RentPeriod[]>;
    /**
     * Creates any missing periods from each tenant's lease start through
     * `throughMonth` (a month key), in one round trip. `tenantIds: null`
     * means every active tenant. Returns how many were created.
     */
    ensure(tenantIds: string[] | null, throughMonth: string): Promise<number>;
  };
  payments: {
    findByTokenHash(tokenHash: string): Promise<Payment | null>;
    /** For an adjustment receipt: the receipt number it corrects. */
    get(id: string): Promise<Payment | null>;
    listAllocations(paymentId: string): Promise<PaymentAllocation[]>;
    /** Proof files, appended to the tenant-signed receipt. */
    listProofs(paymentIds: string[]): Promise<PaymentProof[]>;
    /**
     * Records the tenant's signature, OTP time and signed receipt. Moves no
     * money (the payment counted when it was recorded). False if it was
     * already acknowledged (a racing acknowledgement won).
     */
    acknowledge(id: string, patch: AcknowledgementPatch): Promise<boolean>;
  };
  adjustments: {
    findByTokenHash(tokenHash: string): Promise<Adjustment | null>;
    listAllocations(adjustmentId: string): Promise<AdjustmentAllocation[]>;
    acknowledge(id: string, patch: AcknowledgementPatch): Promise<boolean>;
  };
  rateLimits: {
    /** Records one hit for `key`; false once it's over `limit` hits per `windowSeconds`. */
    hit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
    /** Drops expired counters; returns how many. */
    prune(): Promise<number>;
  };
}

// ---- Auth (the owner's login session) ----

export interface AuthGateway {
  /** The signed-in account for the current request (and whether it is the app owner), or null. */
  getSession(): Promise<Session | null>;
  /**
   * Emails a one-time sign-in link that lands on `redirectTo`. Creates the
   * account only when `allowSignUp`; otherwise an unknown email gets nothing.
   */
  sendMagicLink(email: string, redirectTo: string, options: { allowSignUp: boolean }): Promise<void>;
  /** Dev only: creates the sign-in link without sending email. */
  generateMagicLink(email: string, redirectTo: string): Promise<string>;
  /** Signs in and sets the session cookies; false for a wrong email or password. */
  signInWithPassword(email: string, password: string): Promise<boolean>;
  /** Sets the signed-in account's password. */
  updatePassword(password: string): Promise<void>;
  /**
   * For receipts, which the tenant's confirm flow renders without a session:
   * the owner's name (owner_profile, else the account's name or email) and
   * the name under the signature (signature_name, else the owner's name).
   */
  ownerNames(): Promise<{ owner: string; signature: string } | null>;
  /** Completes a PKCE sign-in and sets the session cookies. */
  exchangeCode(code: string): Promise<void>;
  /** Completes an implicit-flow sign-in and sets the session cookies. */
  setSession(accessToken: string, refreshToken: string): Promise<void>;
  signOut(): Promise<void>;
}

// ---- Private file storage (signatures, receipts) ----

export interface FileStorage {
  /** Fails if `path` already exists. */
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  download(path: string): Promise<Uint8Array>;
  signedUrl(path: string, expiresInSeconds: number): Promise<string>;
  /** Best-effort delete, for files whose ledger write didn't happen. Never throws. */
  remove(paths: string[]): Promise<void>;
}

// ---- Messaging (tenant OTP + confirm links) ----

export type NotifyChannel = PreferredChannel;

export interface Messaging {
  /** Starts an SMS one-time-code verification. */
  sendOtp(phoneE164: string): Promise<void>;
  /** True only for a correct, unexpired code - false (not a throw) for a wrong, expired or unknown one. */
  checkOtp(phoneE164: string, code: string): Promise<boolean>;
  /** Sends on the preferred channel(s); `delivered` if at least one channel accepted it. */
  send(params: { toPhoneE164: string; channel: NotifyChannel; message: string }): Promise<{ delivered: boolean }>;
}
