import "server-only";
import { sql } from "drizzle-orm";
import { index, integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./columns";
import { tenants } from "./tenants";

// 0004_ledger_integrity.sql (D12): fixed-window counters, service role only.

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    window_start: timestamptz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.window_start] }), index("rate_limits_window_start_idx").on(t.window_start)]
);

// 0033_tenant_portal.sql (D37): tenant portal sign-ins, service role only.
export const tenantSessions = pgTable(
  "tenant_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token_hash: text("token_hash").notNull().unique(),
    phone: text("phone").notNull(),
    tenant_id: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict", onUpdate: "restrict" }),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    expires_at: timestamptz("expires_at").notNull(),
    revoked_at: timestamptz("revoked_at"),
    ip_hash: text("ip_hash"),
  },
  (t) => [index("tenant_sessions_expires_at_idx").on(t.expires_at)]
);

// 0035_otp_sessions.sql (D38): an SMS code's provider reference until it is checked.
export const otpSessions = pgTable(
  "otp_sessions",
  {
    key: text("key").primaryKey(),
    reference: text("reference").notNull(),
    created_at: timestamptz("created_at").notNull().default(sql`now()`),
    expires_at: timestamptz("expires_at").notNull(),
  },
  (t) => [index("otp_sessions_expires_at_idx").on(t.expires_at)]
);
