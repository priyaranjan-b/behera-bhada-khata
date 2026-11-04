import "server-only";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { APP_TIME_ZONE, addDaysToKey } from "@/lib/dates";
import type { AuditLogEntry } from "@/lib/types";
import type { AuditFilter } from "@/server/ports";
import type { Tx } from "../client";
import { auditLog } from "../schema";

// The audit log, newest first (0015, D25): read only, written by the
// triggers and log_event(). Under RLS, so only the owner sees anything.

/** The instant an APP_TIME_ZONE day starts, as a timestamptz bound (index-friendly on `at`). */
const dayStart = (dateKey: string) => sql`(${dateKey}::date::timestamp at time zone ${APP_TIME_ZONE})`;

/** One page: `beforeId` continues below the last id shown. */
export function listAudit(tx: Tx, filter: AuditFilter): Promise<AuditLogEntry[]> {
  return tx
    .select()
    .from(auditLog)
    .where(
      and(
        filter.tenantId ? eq(auditLog.tenant_id, filter.tenantId) : undefined,
        filter.unitCode ? eq(auditLog.unit_code, filter.unitCode) : undefined,
        filter.propertyCode ? eq(auditLog.property_code, filter.propertyCode) : undefined,
        filter.entity ? and(eq(auditLog.entity_type, filter.entity.type), eq(auditLog.entity_id, filter.entity.id)) : undefined,
        filter.actions?.length ? inArray(auditLog.action, [...filter.actions]) : undefined,
        filter.fromDate ? gte(auditLog.at, dayStart(filter.fromDate)) : undefined,
        // The whole of the last day: before the next one starts.
        filter.toDate ? lt(auditLog.at, dayStart(addDaysToKey(filter.toDate, 1))) : undefined,
        filter.beforeId !== undefined ? lt(auditLog.id, filter.beforeId) : undefined
      )
    )
    .orderBy(desc(auditLog.id))
    .limit(filter.limit);
}
