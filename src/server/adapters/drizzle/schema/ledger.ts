import "server-only";
import { sql } from "drizzle-orm";
import { index, integer, pgTable, primaryKey, text, unique, uuid } from "drizzle-orm/pg-core";
import { PAYMENT_MODES, type LedgerStatus, type PeriodStatus, type ProofContentType } from "@/lib/types";
import { dateKey, money, timestamptz } from "./columns";
import { tenants } from "./tenants";

// 0001/0004/0009/0010/0012: the append-only ledger (D4). Code here only
// reads these; every write is a SQL function (create_payment,
// create_adjustment, acknowledge_*), and those stay in Postgres.

export const rentPeriods = pgTable(
  "rent_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** First of the month. */
    period_month: dateKey("period_month").notNull(),
    amount_due: money("amount_due").notNull(),
    amount_allocated: money("amount_allocated").notNull().default(0),
    /**
     * Generated from the two amounts (the expression lives in the migration).
     * A case with an else, so never null, though the catalog says nullable.
     */
    status: text("status")
      .$type<PeriodStatus>()
      .notNull()
      .generatedAlwaysAs(sql`null`),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (t) => [
    unique("rent_periods_tenant_id_period_month_key").on(t.tenant_id, t.period_month),
    index("rent_periods_period_month_idx").on(t.period_month),
  ]
);

/** Columns payments and adjustments share (the confirm link, signatures, receipt number). */
function recordColumns() {
  return {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    status: text("status").$type<LedgerStatus>().notNull().default("confirmed"),
    owner_signature_path: text("owner_signature_path"),
    tenant_signature_path: text("tenant_signature_path"),
    otp_verified_at: timestamptz("otp_verified_at"),
    pdf_path: text("pdf_path"),
    token_hash: text("token_hash").notNull().unique(),
    token_expires_at: timestamptz("token_expires_at").notNull(),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    confirmed_at: timestamptz("confirmed_at"),
    acknowledged_at: timestamptz("acknowledged_at"),
    receipt_no: text("receipt_no").notNull().unique(),
    recorded_by: uuid("recorded_by"),
  };
}

export const payments = pgTable(
  "payments",
  {
    ...recordColumns(),
    amount: money("amount").notNull(),
    payment_date: dateKey("payment_date").notNull(),
    mode: text("mode", { enum: PAYMENT_MODES }).notNull(),
    note: text("note"),
  },
  (t) => [
    index("payments_payment_date_idx").on(t.payment_date),
    index("payments_tenant_date_idx").on(t.tenant_id, t.payment_date),
  ]
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payment_id: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    rent_period_id: uuid("rent_period_id")
      .notNull()
      .references(() => rentPeriods.id, { onDelete: "restrict" }),
    amount_allocated: money("amount_allocated").notNull(),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (t) => [
    unique("payment_allocations_payment_id_rent_period_id_key").on(t.payment_id, t.rent_period_id),
    index("payment_allocations_rent_period_id_idx").on(t.rent_period_id),
  ]
);

export const adjustments = pgTable(
  "adjustments",
  {
    ...recordColumns(),
    original_payment_id: uuid("original_payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    delta_amount: money("delta_amount").notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [
    index("adjustments_original_payment_id_idx").on(t.original_payment_id),
    index("adjustments_tenant_confirmed_idx").on(t.tenant_id, t.confirmed_at),
  ]
);

export const adjustmentAllocations = pgTable(
  "adjustment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adjustment_id: uuid("adjustment_id")
      .notNull()
      .references(() => adjustments.id, { onDelete: "restrict" }),
    rent_period_id: uuid("rent_period_id")
      .notNull()
      .references(() => rentPeriods.id, { onDelete: "restrict" }),
    amount_delta: money("amount_delta").notNull(),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (t) => [
    unique("adjustment_allocations_adjustment_id_rent_period_id_key").on(t.adjustment_id, t.rent_period_id),
    index("adjustment_allocations_rent_period_id_idx").on(t.rent_period_id),
  ]
);

export const paymentProofs = pgTable(
  "payment_proofs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payment_id: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict", onUpdate: "restrict" }),
    storage_path: text("storage_path").notNull().unique(),
    file_name: text("file_name").notNull(),
    content_type: text("content_type").$type<ProofContentType>().notNull(),
    size_bytes: integer("size_bytes").notNull(),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (t) => [index("payment_proofs_payment_id_idx").on(t.payment_id)]
);

/** Taken by next_receipt_no() inside create_payment / create_adjustment (D22). */
export const receiptCounters = pgTable(
  "receipt_counters",
  {
    series: text("series").notNull(),
    month: dateKey("month").notNull(),
    last_no: integer("last_no").notNull(),
  },
  (t) => [primaryKey({ columns: [t.series, t.month] })]
);
