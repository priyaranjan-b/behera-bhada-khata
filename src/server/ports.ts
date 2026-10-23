// The backend's outside-world dependencies, as interfaces. Services depend
// only on these; `src/server/infra.ts` binds them to an implementation
// (today: src/server/adapters/supabase). Moving to another database or a
// standalone Node.js server means writing a new adapter that satisfies these
// interfaces - services and route handlers stay as they are.
import type {
  Adjustment,
  AdjustmentAllocation,
  Database,
  LedgerStatus,
  Payment,
  PaymentAllocation,
  Property,
  RentPeriod,
  Tenant,
  TenantStatus,
} from "@/lib/types";
import type { Session } from "@/lib/contracts";

type Insert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];

export type NewProperty = Omit<Insert<"properties">, "id" | "owner_id" | "created_at">;
export type NewTenant = Omit<Insert<"tenants">, "id" | "owner_id" | "created_at" | "status">;
export type NewPayment = Omit<Insert<"payments">, "owner_id" | "created_at" | "status"> & { id: string };
export type NewAdjustment = Omit<Insert<"adjustments">, "owner_id" | "created_at" | "status"> & { id: string };
export type NewRentPeriod = Omit<Insert<"rent_periods">, "id" | "created_at">;

/** Columns written when a tenant confirms a pending payment/adjustment. */
export interface ConfirmationPatch {
  tenant_signature_path: string;
  pdf_path: string;
  otp_verified_at: string;
  confirmed_at: string;
}

// ---- Owner-scoped data (an implementation must only ever return/modify the owner's own rows) ----

export interface OwnerRepositories {
  properties: {
    /** Oldest first. */
    list(): Promise<Property[]>;
    get(id: string): Promise<Property | null>;
    create(input: NewProperty): Promise<{ id: string }>;
  };
  tenants: {
    /** Oldest first. */
    list(filter?: { status?: TenantStatus; propertyId?: string }): Promise<Tenant[]>;
    get(id: string): Promise<Tenant | null>;
    create(input: NewTenant): Promise<{ id: string }>;
  };
  rentPeriods: {
    /** Ordered by period_month ascending. */
    listForTenants(tenantIds: string[]): Promise<RentPeriod[]>;
    listByIds(ids: string[]): Promise<RentPeriod[]>;
  };
  payments: {
    listForTenants(tenantIds: string[], filter?: { status?: LedgerStatus }): Promise<Payment[]>;
    get(id: string): Promise<Payment | null>;
    /** Inserts the pending payment and its allocations. */
    create(payment: NewPayment, allocations: { rent_period_id: string; amount_allocated: number }[]): Promise<void>;
    listAllocations(paymentId: string): Promise<PaymentAllocation[]>;
    /** Replaces the confirm-link token of a still-pending payment; never touches ledger facts. */
    rotateToken(id: string, tokenHash: string, expiresAt: string): Promise<void>;
  };
  adjustments: {
    listForTenants(tenantIds: string[], filter?: { status?: LedgerStatus }): Promise<Adjustment[]>;
    get(id: string): Promise<Adjustment | null>;
    create(adjustment: NewAdjustment, allocations: { rent_period_id: string; amount_delta: number }[]): Promise<void>;
    rotateToken(id: string, tokenHash: string, expiresAt: string): Promise<void>;
  };
}

// ---- System access (no owner scope) - only for flows that authorize some other way:
// the tenant confirm link (possession of the token), rent-period upkeep and cron. ----

export interface SystemRepositories {
  properties: {
    get(id: string): Promise<Property | null>;
  };
  tenants: {
    get(id: string): Promise<Tenant | null>;
    listActiveIds(): Promise<string[]>;
  };
  rentPeriods: {
    listForTenant(tenantId: string): Promise<RentPeriod[]>;
    listByIds(ids: string[]): Promise<RentPeriod[]>;
    insertMany(rows: NewRentPeriod[]): Promise<void>;
    /** amount_allocated += delta, floored at 0. */
    addToAllocated(id: string, delta: number): Promise<void>;
  };
  payments: {
    findByTokenHash(tokenHash: string): Promise<Payment | null>;
    listAllocations(paymentId: string): Promise<PaymentAllocation[]>;
    /** pending -> confirmed compare-and-swap; false if it was no longer pending. */
    confirm(id: string, patch: ConfirmationPatch): Promise<boolean>;
  };
  adjustments: {
    findByTokenHash(tokenHash: string): Promise<Adjustment | null>;
    listAllocations(adjustmentId: string): Promise<AdjustmentAllocation[]>;
    confirm(id: string, patch: ConfirmationPatch): Promise<boolean>;
  };
}

// ---- Auth (the owner's login session) ----

export interface AuthGateway {
  /** The signed-in owner for the current request, or null. */
  getSession(): Promise<Session | null>;
  /** Emails a one-time sign-in link that lands on `redirectTo`. */
  sendMagicLink(email: string, redirectTo: string): Promise<void>;
  /** Dev only: creates the sign-in link without sending email. */
  generateMagicLink(email: string, redirectTo: string): Promise<string>;
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
}
