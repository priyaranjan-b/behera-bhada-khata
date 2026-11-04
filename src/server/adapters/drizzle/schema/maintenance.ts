import "server-only";
import { sql } from "drizzle-orm";
import { index, integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { MAINTENANCE_CATEGORIES, type ProofContentType } from "@/lib/types";
import { dateKey, money, timestamptz } from "./columns";
import { payments } from "./ledger";
import { units } from "./places";

// 0031_maintenance.sql (D35): money spent on the houses. The expense and its
// houses are written by the maintenance SQL functions only (procedures/);
// its tags and files are plain owner writes under RLS.

export const maintenanceExpenses = pgTable(
  "maintenance_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expense_date: dateKey("expense_date").notNull(),
    amount: money("amount").notNull(),
    category: text("category", { enum: MAINTENANCE_CATEGORIES }).notNull(),
    description: text("description").notNull(),
    vendor: text("vendor"),
    note: text("note"),
    voided_at: timestamptz("voided_at"),
    void_reason: text("void_reason"),
    /** 0032 (A22): the set-off payment that paid for it. */
    settled_by_payment_id: uuid("settled_by_payment_id").references(() => payments.id, {
      onDelete: "restrict",
      onUpdate: "restrict",
    }),
    recorded_by: uuid("recorded_by"),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
  },
  (t) => [index("maintenance_expenses_date_idx").on(t.expense_date.desc(), t.id)]
);

export const maintenanceExpenseUnits = pgTable(
  "maintenance_expense_units",
  {
    expense_id: uuid("expense_id")
      .notNull()
      .references(() => maintenanceExpenses.id, { onDelete: "restrict", onUpdate: "restrict" }),
    unit_code: text("unit_code")
      .notNull()
      .references(() => units.unit_code, { onDelete: "restrict", onUpdate: "restrict" }),
    share_amount: money("share_amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.expense_id, t.unit_code] }), index("maintenance_expense_units_unit_idx").on(t.unit_code)]
);

/** Who paid: each expense's own copy of the name. Unique on (expense_id, lower(name)) in the migration. */
export const maintenanceExpenseTags = pgTable(
  "maintenance_expense_tags",
  {
    expense_id: uuid("expense_id")
      .notNull()
      .references(() => maintenanceExpenses.id, { onDelete: "restrict", onUpdate: "restrict" }),
    name: text("name").notNull(),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.expense_id, t.name] })]
);

export const maintenanceFiles = pgTable(
  "maintenance_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expense_id: uuid("expense_id")
      .notNull()
      .references(() => maintenanceExpenses.id, { onDelete: "restrict", onUpdate: "restrict" }),
    storage_path: text("storage_path").notNull().unique(),
    file_name: text("file_name").notNull(),
    content_type: text("content_type").$type<ProofContentType>().notNull(),
    size_bytes: integer("size_bytes").notNull(),
    recorded_by: uuid("recorded_by"),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (t) => [index("maintenance_files_expense_idx").on(t.expense_id, t.created_at)]
);
