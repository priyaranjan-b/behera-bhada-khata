import "server-only";
import { sql } from "drizzle-orm";
import { bigint, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { AuditActorKind, AuditAction } from "@/lib/types";
import { timestamptz } from "./columns";

// 0015_audit_log.sql / 0017_audit_text.sql (D25, D27). Written only by
// triggers and log_event(), which stay in Postgres; nobody may change a row.

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  at: timestamptz("at").notNull().default(sql`now()`),
  tx_id: bigint("tx_id", { mode: "number" }).notNull(),
  actor_id: uuid("actor_id"),
  actor_kind: text("actor_kind").$type<AuditActorKind>().notNull(),
  action: text("action").$type<AuditAction>().notNull(),
  entity_type: text("entity_type").notNull(),
  entity_id: text("entity_id"),
  tenant_id: uuid("tenant_id"),
  unit_code: text("unit_code"),
  property_code: text("property_code"),
  changes: jsonb("changes").$type<Record<string, [unknown, unknown]>>().notNull().default({}),
  context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
  title: text("title").notNull(),
  details: text("details").notNull(),
  actor_name: text("actor_name").notNull(),
});
