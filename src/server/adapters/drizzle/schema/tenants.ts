import "server-only";
import { sql } from "drizzle-orm";
import { bigint, boolean, index, pgTable, pgView, text, unique, uuid } from "drizzle-orm/pg-core";
import { PREFERRED_CHANNELS, TENANT_KINDS, TENANT_STATUSES } from "@/lib/types";
import { dateKey, money, timestamptz } from "./columns";
import { units } from "./places";

// 0001/0006/0007/0008/0016: tenants and their dated houses and rents (D7, D8).
// Written only through the tenant lifecycle functions, which stay in SQL.

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone"),
    preferred_channel: text("preferred_channel", { enum: PREFERRED_CHANNELS }).notNull().default("both"),
    lease_start: dateKey("lease_start"),
    status: text("status", { enum: TENANT_STATUSES }).notNull().default("active"),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    business_name: text("business_name"),
    moved_out_on: dateKey("moved_out_on"),
    updated_at: timestamptz("updated_at").notNull().default(sql`now()`),
    billing_start: dateKey("billing_start"),
    deposit_amount: money("deposit_amount"),
    tenant_kind: text("tenant_kind", { enum: TENANT_KINDS }).notNull().default("individual"),
    rent_tracked: boolean("rent_tracked").notNull().default(true),
  },
  // The tenant portal's sign-in looks tenants up by phone (0033).
  (t) => [index("tenants_phone_idx").on(t.phone).where(sql`phone is not null`)]
);

/** No two tenancies of a house overlap: an exclusion constraint in 0006. */
export const tenantUnits = pgTable(
  "tenant_units",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict", onUpdate: "restrict" }),
    unit_code: text("unit_code")
      .notNull()
      .references(() => units.unit_code, { onDelete: "restrict", onUpdate: "restrict" }),
    start_date: dateKey("start_date").notNull(),
    /** Inclusive; null = still there. */
    end_date: dateKey("end_date"),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    recorded_by: uuid("recorded_by"),
  },
  (t) => [index("tenant_units_tenant_idx").on(t.tenant_id)]
);

export const tenantRentRates = pgTable(
  "tenant_rent_rates",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict", onUpdate: "restrict" }),
    effective_month: dateKey("effective_month").notNull(),
    monthly_amount: money("monthly_amount").notNull(),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    recorded_by: uuid("recorded_by"),
  },
  (t) => [unique("tenant_rent_rates_tenant_id_effective_month_key").on(t.tenant_id, t.effective_month)]
);

/** Who lived where, when (a security_invoker view in 0006). */
export const unitOccupancy = pgView("unit_occupancy", {
  unit_code: text("unit_code").notNull(),
  property_code: text("property_code").notNull(),
  tenant_id: uuid("tenant_id").notNull(),
  tenant_name: text("tenant_name").notNull(),
  tenant_business_name: text("tenant_business_name"),
  start_date: dateKey("start_date").notNull(),
  end_date: dateKey("end_date"),
  is_current: boolean("is_current").notNull(),
}).existing();
