// In-memory stand-ins for the ports (src/server/ports.ts), for service tests.
// Tests wire them in with:
//   vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());
// and call resetFakes() in beforeEach. Services read the bindings at call
// time, so the getters below always hand out the current fakes.
import { vi } from "vitest";
import type {
  Adjustment,
  Payment,
  PaymentAllocation,
  PaymentProof,
  Property,
  RentPeriod,
  Tenant,
  TenantRentRate,
  Unit,
  UnitOccupancy,
} from "@/lib/types";

export const OWNER_ID = "00000000-0000-4000-8000-00000000000a";

export function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "tenant-1",
    name: "Asha",
    business_name: null,
    phone: "+919876543210",
    preferred_channel: "both",
    lease_start: "2026-01-01",
    status: "active",
    moved_out_on: null,
    billing_start: "2026-01-01",
    deposit_amount: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "payment-1",
    tenant_id: "tenant-1",
    amount: "5000.00",
    payment_date: "2026-03-05",
    mode: "upi",
    note: null,
    // Since 0010 a payment is confirmed as soon as it's recorded.
    status: "confirmed",
    owner_signature_path: "payments/property-1/tenant-1/payment-1/owner-signature.png",
    tenant_signature_path: null,
    otp_verified_at: null,
    pdf_path: null,
    token_hash: "hash",
    token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: "2026-03-05T04:00:00Z",
    confirmed_at: "2026-03-05T04:00:00Z",
    acknowledged_at: null,
    ...overrides,
  };
}

const property: Property = {
  property_code: "AC-T1",
  location_code: "AC",
  tower_code: "T1",
  name: "Tower 1",
  created_at: "",
  updated_at: "",
};
const units: Unit[] = ["AC-T1-G01", "AC-T1-G02"].map((unit_code) => ({
  unit_code,
  property_code: "AC-T1",
  house_number: unit_code.slice(-3),
  floor: "G",
  unit_type: "commercial",
  label: null,
  is_active: true,
  created_at: "",
  updated_at: "",
}));
/** tenant-1 holds both houses of AC-T1 at one combined rent. */
const occupancy: UnitOccupancy[] = units.map((u) => ({
  unit_code: u.unit_code,
  property_code: "AC-T1",
  tenant_id: "tenant-1",
  tenant_name: "Asha",
  tenant_business_name: null,
  start_date: "2026-01-01",
  end_date: null,
  is_current: true,
}));
const rate: TenantRentRate = {
  id: 1,
  tenant_id: "tenant-1",
  effective_month: "2026-01-01",
  monthly_amount: "5000.00",
  created_at: "",
};
const period: RentPeriod = {
  id: "period-mar",
  tenant_id: "tenant-1",
  period_month: "2026-03-01",
  amount_due: "5000.00",
  amount_allocated: "0.00",
  status: "pending",
  created_at: "",
};
const allocation: PaymentAllocation = {
  id: "alloc-1",
  payment_id: "payment-1",
  rent_period_id: "period-mar",
  amount_allocated: "5000.00",
  created_at: "",
};

/** A tiny valid PNG as a data URL. */
export const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function build() {
  const state = {
    tenants: new Map<string, Tenant>([["tenant-1", tenant()]]),
    payments: new Map<string, Payment>([["payment-1", payment()]]),
    adjustments: new Map<string, Adjustment>(),
    files: new Map<string, Uint8Array>(),
    proofs: new Map<string, PaymentProof>(),
    rateLimitAllows: true,
  };

  const owner = {
    locations: {
      list: vi.fn(async () => [
        { location_code: "AC", name: "Arnapal Chakk Complex", address: null, created_at: "", updated_at: "" },
      ]),
    },
    properties: { list: vi.fn(async () => [property]), get: vi.fn(async () => property), create: vi.fn() },
    units: { list: vi.fn(async () => units), create: vi.fn() },
    occupancy: { list: vi.fn(async () => occupancy) },
    rentRates: { listForTenants: vi.fn(async () => [rate]) },
    tenants: {
      list: vi.fn(async () => [...state.tenants.values()]),
      get: vi.fn(async (id: string) => state.tenants.get(id) ?? null),
      create: vi.fn(async () => ({ id: "tenant-new" })),
      update: vi.fn(async () => undefined),
      moveOut: vi.fn(async () => undefined),
    },
    rentPeriods: { listForTenants: vi.fn(async () => [period]), listByIds: vi.fn(async () => [period]) },
    payments: {
      listForTenants: vi.fn(async () => [...state.payments.values()]),
      get: vi.fn(async (id: string) => state.payments.get(id) ?? null),
      create: vi.fn(async () => undefined),
      listAllocations: vi.fn(async () => [allocation]),
      listProofs: vi.fn(async (ids: string[]) => [...state.proofs.values()].filter((p) => ids.includes(p.payment_id))),
      getProof: vi.fn(async (id: string) => state.proofs.get(id) ?? null),
      rotateToken: vi.fn(async (id: string) => !state.payments.get(id)?.acknowledged_at),
    },
    adjustments: {
      listForTenants: vi.fn(async () => []),
      get: vi.fn(async (id: string) => state.adjustments.get(id) ?? null),
      create: vi.fn(async () => undefined),
      listAllocations: vi.fn(async () => []),
      rotateToken: vi.fn(async (id: string) => !state.adjustments.get(id)?.acknowledged_at),
    },
  };

  const system = {
    properties: { get: vi.fn(async () => property) },
    tenants: { get: vi.fn(async (id: string) => state.tenants.get(id) ?? null) },
    occupancy: { listForTenant: vi.fn(async () => occupancy) },
    rentPeriods: { listByIds: vi.fn(async () => [period]), ensure: vi.fn(async () => 0) },
    payments: {
      findByTokenHash: vi.fn(async () => state.payments.get("payment-1") ?? null),
      listAllocations: vi.fn(async () => [allocation]),
      acknowledge: vi.fn(async () => true),
    },
    adjustments: {
      findByTokenHash: vi.fn(async () => null),
      listAllocations: vi.fn(async () => []),
      acknowledge: vi.fn(async () => true),
    },
    rateLimits: { hit: vi.fn(async () => state.rateLimitAllows), prune: vi.fn(async () => 0) },
  };

  const storage = {
    upload: vi.fn(async (path: string, bytes: Uint8Array) => {
      if (state.files.has(path)) throw new Error(`exists: ${path}`);
      state.files.set(path, bytes);
    }),
    download: vi.fn(async () => Uint8Array.from(Buffer.from(PNG_DATA_URL.split(",")[1], "base64"))),
    signedUrl: vi.fn(async (path: string) => `https://storage.test/${path}?sig`),
    remove: vi.fn(async (paths: string[]) => {
      for (const p of paths) state.files.delete(p);
    }),
  };

  const messaging = {
    sendOtp: vi.fn(async () => undefined),
    checkOtp: vi.fn(async () => true),
    send: vi.fn(async () => ({ delivered: true })),
  };

  const auth = {
    getSession: vi.fn(async () => ({ userId: OWNER_ID, isOwner: true })),
    sendMagicLink: vi.fn(async () => undefined),
    generateMagicLink: vi.fn(async () => "https://auth.test/link"),
    ownerDisplayName: vi.fn(async () => "Priyaranjan"),
    exchangeCode: vi.fn(),
    setSession: vi.fn(),
    signOut: vi.fn(),
  };

  return { state, owner, system, storage, messaging, auth };
}

export const fakes = build();

/** Fresh fakes for the next test. */
export function resetFakes() {
  const next = build();
  Object.assign(fakes, next);
  return fakes;
}

export function infraMock() {
  return {
    ownerDb: async () => fakes.owner,
    systemDb: () => fakes.system,
    get storage() {
      return fakes.storage;
    },
    get messaging() {
      return fakes.messaging;
    },
    get auth() {
      return fakes.auth;
    },
  };
}
