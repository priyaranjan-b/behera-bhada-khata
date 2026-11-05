// In-memory stand-ins for the ports (src/server/ports.ts), for service tests.
// Tests wire them in with:
//   vi.mock("@/server/infra", async () => (await import("../fakes")).infraMock());
// and call resetFakes() in beforeEach. Services read the bindings at call
// time, so the getters below always hand out the current fakes.
import { vi } from "vitest";
import type {
  AuditEvent,
  AuditFilter,
  AuditHistoryFilter,
  MaintenanceExpenseFields,
  MaintenanceExpenseRecord,
  NewMaintenanceFile,
} from "@/server/ports";
import { auditActionLabel } from "@/lib/domain/audit";
import { ApiError } from "@/lib/errors";
import type {
  Adjustment,
  AuditLogEntry,
  OwnerProfile,
  Payment,
  PaymentNotePreset,
  PaymentTag,
  PaymentAllocation,
  PaymentProof,
  TenantDocument,
  Property,
  RentPeriod,
  Tenant,
  TenantRentRate,
  Unit,
  UnitOccupancy,
} from "@/lib/types";

function notePreset(id: string, text: string): PaymentNotePreset {
  return { id, text, created_at: "2026-10-24T00:00:00Z", updated_at: "2026-10-24T00:00:00Z" };
}

function paymentTag(id: string, name: string): PaymentTag {
  return { id, name, created_at: "2026-10-24T00:00:00Z", updated_at: "2026-10-24T00:00:00Z" };
}

const byName = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());

export const OWNER_ID = "00000000-0000-4000-8000-00000000000a";

export function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    name: "Asha",
    business_name: null,
    phone: "+919876543210",
    preferred_channel: "both",
    lease_start: "2026-01-01",
    status: "active",
    moved_out_on: null,
    billing_start: "2026-01-01",
    deposit_amount: null,
    tenant_kind: "individual",
    rent_tracked: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "00000000-0000-4000-8000-000000000201",
    tenant_id: "00000000-0000-4000-8000-000000000101",
    amount: 5000,
    payment_date: "2026-03-05",
    mode: "upi",
    note: null,
    // Since 0010 a payment is confirmed as soon as it's recorded.
    status: "confirmed",
    owner_signature_path: "payments/property-1/00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/owner-signature.png",
    tenant_signature_path: null,
    otp_verified_at: null,
    pdf_path: null,
    token_hash: "hash",
    token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: "2026-03-05T04:00:00Z",
    confirmed_at: "2026-03-05T04:00:00Z",
    acknowledged_at: null,
    receipt_no: "2026/03/001",
    recorded_by: OWNER_ID,
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
/** 00000000-0000-4000-8000-000000000101 holds both houses of AC-T1 at one combined rent. */
const occupancy: UnitOccupancy[] = units.map((u) => ({
  unit_code: u.unit_code,
  property_code: "AC-T1",
  tenant_id: "00000000-0000-4000-8000-000000000101",
  tenant_name: "Asha",
  tenant_business_name: null,
  start_date: "2026-01-01",
  end_date: null,
  is_current: true,
}));
const rate: TenantRentRate = {
  id: 1,
  tenant_id: "00000000-0000-4000-8000-000000000101",
  effective_month: "2026-01-01",
  monthly_amount: 5000,
  created_at: "",
  recorded_by: OWNER_ID,
};
const period: RentPeriod = {
  id: "period-mar",
  tenant_id: "00000000-0000-4000-8000-000000000101",
  period_month: "2026-03-01",
  amount_due: 5000,
  amount_allocated: 0,
  status: "pending",
  created_at: "",
};
const allocation: PaymentAllocation = {
  id: "alloc-1",
  payment_id: "00000000-0000-4000-8000-000000000201",
  rent_period_id: "period-mar",
  amount_allocated: 5000,
  created_at: "",
};

/** A tiny valid PNG as a data URL. */
export const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function build() {
  const state = {
    tenants: new Map<string, Tenant>([["00000000-0000-4000-8000-000000000101", tenant()]]),
    payments: new Map<string, Payment>([["00000000-0000-4000-8000-000000000201", payment()]]),
    adjustments: new Map<string, Adjustment>(),
    files: new Map<string, Uint8Array>(),
    proofs: new Map<string, PaymentProof>(),
    documents: new Map<string, TenantDocument>(),
    profile: null as OwnerProfile | null,
    notePresets: new Map<string, PaymentNotePreset>([
      ["00000000-0000-4000-8000-000000000501", notePreset("00000000-0000-4000-8000-000000000501", "Paid via UPI")],
    ]),
    notesAdded: 0,
    /** The suggestions (payment_tags). */
    tags: new Map<string, PaymentTag>([
      ["00000000-0000-4000-8000-000000000601", paymentTag("00000000-0000-4000-8000-000000000601", "Padma")],
    ]),
    tagsAdded: 0,
    /** Each payment's own copy of its tag names (payment_record_tags). */
    paymentTags: new Map<string, string[]>(),
    /** Maintenance expenses (0031) by id, with their houses, tags and files. */
    maintenance: new Map<string, MaintenanceExpenseRecord>(),
    rateLimitAllows: true,
    /** Newest last; list() returns newest first like the database. */
    audit: [] as AuditLogEntry[],
  };

  /** Like the unique index on lower(text): a duplicate is the adapter's 409. */
  function saveNote(id: string, text: string) {
    const clash = [...state.notePresets.values()].some((n) => n.id !== id && n.text.toLowerCase() === text.toLowerCase());
    if (clash) throw new ApiError(409, "That already exists");
    state.notePresets.set(id, notePreset(id, text));
  }

  /** Like the unique index on lower(name): a duplicate is the adapter's 409. */
  function saveTag(id: string, name: string) {
    const clash = [...state.tags.values()].some((t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase());
    if (clash) throw new ApiError(409, "That already exists");
    state.tags.set(id, paymentTag(id, name));
  }

  /** As tables/paymentTags.ts setPaymentTags: names it has stay, a new one takes a suggestion's spelling or joins them. */
  function setTags(paymentId: string, names: string[]): string[] | null {
    if (!state.payments.has(paymentId)) return null;
    const current = state.paymentTags.get(paymentId) ?? [];
    const lower = names.map((n) => n.toLowerCase());
    const kept = current.filter((n) => lower.includes(n.toLowerCase()));
    for (const name of names) {
      if (kept.some((k) => k.toLowerCase() === name.toLowerCase())) continue;
      const known = [...state.tags.values()].find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (!known) saveTag(`00000000-0000-4000-8000-${String(601 + ++state.tagsAdded).padStart(12, "0")}`, name);
      kept.push(known?.name ?? name);
    }
    state.paymentTags.set(paymentId, kept);
    return [...kept].sort(byName);
  }

  function logAudit(event: AuditEvent, actorKind: AuditLogEntry["actor_kind"], actorId: string | null) {
    state.audit.push({
      id: state.audit.length + 1,
      at: new Date().toISOString(),
      tx_id: state.audit.length + 1,
      actor_id: actorId,
      actor_kind: actorKind,
      action: event.action,
      entity_type: event.entityType ?? event.action.split(".")[0],
      entity_id: event.entityId ?? null,
      tenant_id: event.tenantId ?? null,
      unit_code: null,
      property_code: null,
      changes: {},
      context: event.context ?? {},
      // The database writes the real text (0017); test/schema.test.ts covers it.
      title: auditActionLabel(event.action),
      details: "",
      actor_name: actorKind === "owner" ? "Ramesh Sahu" : "System",
    });
  }

  const owner = {
    audit: {
      list: vi.fn(async (f: AuditFilter) =>
        [...state.audit]
          .reverse()
          .filter(
            (e) =>
              (!f.tenantId || e.tenant_id === f.tenantId) &&
              (!f.unitCode || e.unit_code === f.unitCode) &&
              (!f.propertyCode || e.property_code === f.propertyCode) &&
              (!f.actions?.length || f.actions.includes(e.action)) &&
              (f.beforeId === undefined || e.id < f.beforeId)
          )
          .slice(0, f.limit)
      ),
      // The history query, simplified: tenant, actions, search, newest first, one page.
      // Its full SQL behaviour is in test/schema.test.ts.
      historyPage: vi.fn(async (f: AuditHistoryFilter) => {
        const all = [...state.audit].reverse().filter((e) => !f.tenantId || e.tenant_id === f.tenantId);
        const words = (f.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
        const matching = all.filter(
          (e) =>
            (!f.actions || f.actions.includes(e.action)) &&
            words.every((w) => [e.actor_name, e.title, e.unit_code, e.details].join("\n").toLowerCase().includes(w))
        );
        const page = Math.min(f.page, Math.max(0, Math.ceil(matching.length / f.pageSize) - 1));
        return {
          rows: matching.slice(page * f.pageSize, (page + 1) * f.pageSize),
          total: matching.length,
          all: all.length,
          page,
        };
      }),
      log: vi.fn(async (event: AuditEvent) => logAudit(event, "owner", OWNER_ID)),
    },
    ownerProfile: {
      get: vi.fn(async () => state.profile),
      save: vi.fn(async (p: Pick<OwnerProfile, "first_name" | "last_name" | "signature_name" | "signature_path">) => {
        state.profile = { singleton: true, created_at: "", updated_at: "", ...p };
      }),
    },
    paymentNotePresets: {
      list: vi.fn(async () => [...state.notePresets.values()].sort((a, b) => a.text.localeCompare(b.text))),
      create: vi.fn(async (text: string) => {
        saveNote(`00000000-0000-4000-8000-${String(501 + ++state.notesAdded).padStart(12, "0")}`, text);
      }),
      update: vi.fn(async (id: string, text: string) => {
        if (!state.notePresets.has(id)) return false;
        saveNote(id, text);
        return true;
      }),
      remove: vi.fn(async (id: string) => state.notePresets.delete(id)),
    },
    paymentTags: {
      list: vi.fn(async () =>
        [...state.tags.values()]
          .sort((a, b) => byName(a.name, b.name))
          .map((t) => ({
            ...t,
            payment_count: [...state.paymentTags.values()].filter((names) =>
              names.some((n) => n.toLowerCase() === t.name.toLowerCase())
            ).length,
          }))
      ),
      create: vi.fn(async (name: string) => {
        saveTag(`00000000-0000-4000-8000-${String(601 + ++state.tagsAdded).padStart(12, "0")}`, name);
      }),
      update: vi.fn(async (id: string, name: string) => {
        if (!state.tags.has(id)) return false;
        saveTag(id, name);
        return true;
      }),
      remove: vi.fn(async (id: string) => state.tags.delete(id)),
    },
    locations: {
      list: vi.fn(async () => [
        { location_code: "AC", name: "Arnapal Chakk Complex", address: null, created_at: "", updated_at: "" },
      ]),
    },
    properties: { list: vi.fn(async () => [property]), get: vi.fn(async () => property), create: vi.fn() },
    units: { list: vi.fn(async () => units), create: vi.fn() },
    occupancy: { list: vi.fn(async () => occupancy) },
    maintenance: {
      monthly: vi.fn(async () => [] as { month: string; amount: number; cash: number }[]),
      page: vi.fn(async () => ({
        rows: [],
        total: 0,
        all: 0,
        page: 0,
        totals: { amount: 0, cash: 0, count: 0, by_category: {}, by_tag: [], untagged: 0 },
      })),
      get: vi.fn(async (id: string) => state.maintenance.get(id) ?? null),
      create: vi.fn(
        async (
          id: string,
          f: MaintenanceExpenseFields,
          unitCodes: string[],
          tags: string[],
          files: NewMaintenanceFile[],
          settledByPaymentId?: string | null
        ) => {
          const share = Math.round((f.amount * 100) / unitCodes.length) / 100;
          state.maintenance.set(id, {
            expense: {
              ...f,
              id,
              voided_at: null,
              void_reason: null,
              settled_by_payment_id: settledByPaymentId ?? null,
              recorded_by: OWNER_ID,
              created_at: "2026-10-24T00:00:00Z",
              updated_at: "2026-10-24T00:00:00Z",
            },
            units: [...unitCodes].sort().map((unit_code) => ({
              unit_code,
              share_amount: share,
              property_code: "AC-T1",
              property_name: "Tower 1",
              label: null,
            })),
            tags: [...tags].sort(byName),
            files: files.map((r, i) => ({
              ...r,
              id: `00000000-0000-4000-8000-${String(900 + i).padStart(12, "0")}`,
              recorded_by: OWNER_ID,
              created_at: "2026-10-24T00:00:00Z",
            })),
            settled_by_receipt_no: null,
          });
        }
      ),
      update: vi.fn(async (id: string, f: MaintenanceExpenseFields) => {
        const record = state.maintenance.get(id);
        if (!record) throw new ApiError(404, "Expense not found");
        if (record.expense.voided_at) throw new ApiError(409, "This expense was voided and can't be changed");
        record.expense = { ...record.expense, ...f };
      }),
      void: vi.fn(async (id: string, reason: string) => {
        const record = state.maintenance.get(id);
        if (!record) throw new ApiError(404, "Expense not found");
        if (record.expense.voided_at) throw new ApiError(409, "This expense is already voided");
        record.expense = { ...record.expense, voided_at: "2026-10-25T00:00:00Z", void_reason: reason };
      }),
      setTags: vi.fn(async (id: string, names: string[]) => {
        const record = state.maintenance.get(id);
        if (!record) return null;
        record.tags = [...names].sort(byName);
        return record.tags;
      }),
      addFiles: vi.fn(async (rows: NewMaintenanceFile[]) => {
        for (const row of rows) {
          const record = state.maintenance.get(row.expense_id)!;
          record.files.push({
            ...row,
            id: `00000000-0000-4000-8000-${String(950 + record.files.length).padStart(12, "0")}`,
            recorded_by: OWNER_ID,
            created_at: "2026-10-24T00:00:00Z",
          });
        }
      }),
      getFile: vi.fn(async (fileId: string) => {
        for (const r of state.maintenance.values()) {
          const file = r.files.find((f) => f.id === fileId);
          if (file) return file;
        }
        return null;
      }),
      removeFile: vi.fn(async (fileId: string) => {
        for (const r of state.maintenance.values()) {
          const i = r.files.findIndex((f) => f.id === fileId);
          if (i >= 0) {
            r.files.splice(i, 1);
            return true;
          }
        }
        return false;
      }),
    },
    tenantDocuments: {
      list: vi.fn(async (tenantId: string) => [...state.documents.values()].filter((d) => d.tenant_id === tenantId)),
      tenantIdsWithDocuments: vi.fn(async () => [...new Set([...state.documents.values()].map((d) => d.tenant_id))]),
      get: vi.fn(async (id: string) => state.documents.get(id) ?? null),
      create: vi.fn(async (rows: Omit<TenantDocument, "id" | "created_at">[]) => {
        for (const row of rows) {
          const id = `00000000-0000-4000-8000-${String(state.documents.size + 1).padStart(12, "0")}`;
          state.documents.set(id, { ...row, id, created_at: "2026-10-24T00:00:00Z", recorded_by: OWNER_ID });
        }
      }),
      remove: vi.fn(async (id: string) => state.documents.delete(id)),
    },
    rentRates: { listForTenants: vi.fn(async () => [rate]) },
    tenants: {
      list: vi.fn(async () => [...state.tenants.values()]),
      get: vi.fn(async (id: string) => state.tenants.get(id) ?? null),
      create: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000199" })),
      update: vi.fn(async () => undefined),
      moveOut: vi.fn(async () => undefined),
      correctPaidThrough: vi.fn(async (_id: string, paidThrough: string) => paidThrough),
      correctRent: vi.fn(async () => undefined),
      startRentTracking: vi.fn(async () => "2026-03-01"),
      stopRentTracking: vi.fn(async () => undefined),
      accountSummary: vi.fn(async () => ({
        total_outstanding: 5000,
        overdue_months: 1,
        not_yet_due: 0,
        ended_months: 1,
        paid_ended_months: 0,
        can_stop_rent_tracking: false,
      })),
    },
    rentPeriods: {
      listForTenants: vi.fn(async () => [period]),
      listByIds: vi.fn(async () => [period]),
      // The Months query; its real behaviour is in test/adapters/drizzle/queries.
      page: vi.fn(async () => ({
        rows: [
          {
            id: period.id,
            period_month: period.period_month,
            amount_due: Number(period.amount_due),
            amount_allocated: Number(period.amount_allocated),
            status: period.status,
            display_status: period.status,
            month_label: "March 2026",
          },
        ],
        total: 1,
        all: 1,
        page: 0,
        sums: {
          amount_due: Number(period.amount_due),
          amount_allocated: Number(period.amount_allocated),
          not_yet_due: 0,
        },
      })),
    },
    // The Billing query and totals; their real behaviour is in test/adapters/drizzle/queries.
    billing: {
      page: vi.fn(async () => ({
        rows: [
          {
            id: period.id,
            tenant_id: period.tenant_id,
            tenant_name: "Asha",
            property_name: "Tower 1",
            unit_codes: ["AC-T1-G01"],
            period_month: period.period_month,
            month_label: "March 2026",
            amount_due: 5000,
            amount_allocated: 5000,
            balance: 0,
            status: "paid" as const,
            not_yet_due: false,
            paid_direct: false,
            payments: [
              {
                payment_id: "00000000-0000-4000-8000-000000000201",
                receipt_no: "2026/03/001",
                payment_date: "2026-03-05",
                mode: "upi" as const,
                amount: 5000,
              },
            ],
          },
        ],
        total: 1,
        all: 1,
        page: 0,
        sums: { amount_due: 5000, amount_allocated: 5000, balance: 0 },
      })),
      totals: vi.fn(async () => ({
        billed: 5000,
        collected: 5000,
        balance: 0,
        overdue: 0,
        collection_rate: 100,
        tenants: 1,
      })),
    },
    // The ledger query, simplified to the tenant's payments; its real behaviour is in test/adapters/drizzle/queries.
    ledger: {
      page: vi.fn(async () => {
        const rows = [...state.payments.values()].map((p) => ({
          id: `payment-${p.id}`,
          type: "payment" as const,
          date: p.payment_date,
          description: `Payment received (${p.mode.replace(/_/g, " ")})`,
          caption: `#${p.receipt_no} · ${p.acknowledged_at ? "signed by tenant" : "not signed by tenant"}`,
          debit: 0,
          credit: Number(p.amount),
          balance: 0,
          status: "confirmed" as const,
          ref_id: p.id,
          receipt_no: p.receipt_no,
          acknowledged: Boolean(p.acknowledged_at),
        }));
        return {
          rows,
          total: rows.length,
          all: rows.length,
          page: 0,
          sums: { debit: 0, credit: rows.reduce((sum, r) => sum + r.credit, 0), not_counted: 0 },
        };
      }),
    },
    payments: {
      listForTenants: vi.fn(async () => [...state.payments.values()]),
      get: vi.fn(async (id: string) => state.payments.get(id) ?? null),
      create: vi.fn(async (p: { id: string }, _allocations: unknown, _proofs?: unknown, tags: string[] = []) => {
        if (tags.length > 0) {
          state.payments.set(p.id, state.payments.get(p.id) ?? payment({ id: p.id }));
          setTags(p.id, tags);
        }
      }),
      setTags: vi.fn(async (id: string, names: string[]) => setTags(id, names)),
      listAllocations: vi.fn(async () => [allocation]),
      listAllocationsForPeriods: vi.fn(async (ids: string[]) => (ids.includes(allocation.rent_period_id) ? [allocation] : [])),
      listProofs: vi.fn(async (ids: string[]) => [...state.proofs.values()].filter((p) => ids.includes(p.payment_id))),
      getProof: vi.fn(async (id: string) => state.proofs.get(id) ?? null),
      rotateToken: vi.fn(async (id: string) => !state.payments.get(id)?.acknowledged_at),
      page: vi.fn(async () => ({
        rows: [],
        total: 0,
        all: 0,
        page: 0,
        totals: { amount: 0, count: 0, by_mode: { cash: 0, bank_transfer: 0, upi: 0, cheque: 0, other: 0, set_off: 0 } },
      })),
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
    audit: {
      log: vi.fn(async (event: AuditEvent & { actorKind: AuditLogEntry["actor_kind"]; actorId?: string | null }) =>
        logAudit(event, event.actorKind, event.actorId ?? null)
      ),
    },
    locations: {
      get: vi.fn(async () => ({ location_code: "AC", name: "Arnapal Chakk Complex", address: null, created_at: "", updated_at: "" })),
    },
    properties: { get: vi.fn(async () => property) },
    tenants: { get: vi.fn(async (id: string) => state.tenants.get(id) ?? null) },
    occupancy: { listForTenant: vi.fn(async () => occupancy) },
    rentPeriods: { listByIds: vi.fn(async () => [period]), ensure: vi.fn(async () => 0) },
    payments: {
      findByTokenHash: vi.fn(async () => state.payments.get("00000000-0000-4000-8000-000000000201") ?? null),
      get: vi.fn(async (id: string) => state.payments.get(id) ?? null),
      listAllocations: vi.fn(async () => [allocation]),
      listProofs: vi.fn(async (ids: string[]) => [...state.proofs.values()].filter((p) => ids.includes(p.payment_id))),
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
    download: vi.fn(async (_path: string) => Uint8Array.from(Buffer.from(PNG_DATA_URL.split(",")[1], "base64"))),
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
    signInWithPassword: vi.fn(async (_email: string, password: string) => password === "correct-horse"),
    updatePassword: vi.fn(async () => undefined),
    ownerNames: vi.fn(async () => ({ owner: "Ramesh Sahu", signature: "Anil Sahu" })),
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

/** Launch-before-Twilio: unset every Twilio variable for this test. */
export async function withoutTwilio() {
  for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID", "TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM"]) {
    vi.stubEnv(key, "");
  }
  (await import("@/server/env")).resetEnvCacheForTests();
}
