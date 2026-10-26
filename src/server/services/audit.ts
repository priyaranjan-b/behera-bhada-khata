import "server-only";
import type { AuditEntry, AuditPage, AuditTablePage } from "@/lib/contracts";
import { actionsInCategory } from "@/lib/domain/audit";
import { tenantDisplayName } from "@/lib/domain/tenant";
import type { AuditLogEntry } from "@/lib/types";
import { AUDIT_LIMITS, auditPageSchema, auditTableQuerySchema, unitCodeSchema } from "@/lib/validation";
import { ownerDb, systemDb } from "@/server/infra";
import type {
  AuditEvent,
  AuditFilter,
  OwnerRepositories,
  SystemRepositories,
  AuditHistoryFilter,
} from "@/server/ports";
import { notFound, parseInput, requireTenant, type OwnerContext } from "./context";

// History of every change (audit_log, 0015 / D25). The database writes the
// table changes itself; this module reads them and adds the app events
// (messages, receipt downloads, sign-ins).

/**
 * Logs an app event. Best effort: a failure is logged and swallowed, so the
 * audit trail never blocks a payment, a message or a sign-in.
 */
export async function recordEvent(db: Pick<OwnerRepositories, "audit">, event: AuditEvent): Promise<void> {
  try {
    await db.audit.log(event);
  } catch (err) {
    console.error("audit:", event.action, err);
  }
}

/** recordEvent for someone without an owner session (a failed sign-in) or a sign-in being completed. */
export async function recordSystemEvent(event: Parameters<SystemRepositories["audit"]["log"]>[0]): Promise<void> {
  try {
    await systemDb().audit.log(event);
  } catch (err) {
    console.error("audit:", event.action, err);
  }
}

/** Rows as entries, with each tenant's current name (the text is as stored). */
async function toEntries(db: OwnerRepositories, rows: AuditLogEntry[]): Promise<AuditEntry[]> {
  if (rows.length === 0) return [];
  const tenantNames = new Map((await db.tenants.list()).map((t) => [t.id, tenantDisplayName(t)]));
  return rows.map((row) => toEntry(row, row.tenant_id ? (tenantNames.get(row.tenant_id) ?? null) : null));
}

async function page(db: OwnerRepositories, filter: Omit<AuditFilter, "limit">): Promise<AuditPage> {
  // One extra row says whether there is another page.
  const rows = await db.audit.list({ ...filter, limit: AUDIT_LIMITS.pageSize + 1 });
  const more = rows.length > AUDIT_LIMITS.pageSize;
  const shown = more ? rows.slice(0, AUDIT_LIMITS.pageSize) : rows;
  return { entries: await toEntries(db, shown), nextBefore: more ? shown[shown.length - 1].id : null };
}

function toEntry(row: AuditLogEntry, tenantName: string | null): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    txId: row.tx_id,
    actorKind: row.actor_kind,
    actorName: row.actor_name,
    action: row.action,
    entityId: row.entity_id,
    tenantId: row.tenant_id,
    tenantName,
    unitCode: row.unit_code,
    propertyCode: row.property_code,
    changes: row.changes,
    context: row.context,
    title: row.title,
    details: row.details,
  };
}

// The table's field names → the columns audit_history_page reads.
const HISTORY_COLUMNS = {
  at: "at",
  actorName: "actor_name",
  title: "title",
  tenantName: "tenant_name",
  unitCode: "unit_code",
  details: "details",
} as const;

/**
 * One page of a history table: one database query over the text stored with
 * each change, paged, searched, filtered and sorted there (A14, D27).
 */
async function historyPage(db: OwnerRepositories, tenantId: string | undefined, query: unknown): Promise<AuditTablePage> {
  const q = parseInput(auditTableQuerySchema, query);
  const filter: AuditHistoryFilter = {
    tenantId,
    actions: q.category ? actionsInCategory(q.category) : undefined,
    fromDate: q.from,
    toDate: q.to,
    search: q.q || undefined,
    filters: q.filters.map((f) => ({ ...f, field: HISTORY_COLUMNS[f.field] })),
    logic: q.logic,
    sort: HISTORY_COLUMNS[q.sort],
    dir: q.dir,
    page: q.page,
    pageSize: q.pageSize,
  };
  const result = await db.audit.historyPage(filter);
  return { entries: await toEntries(db, result.rows), total: result.total, all: result.all, page: result.page };
}

/** Everything that changed, one page at a time: the Activity page. */
export async function listActivity(_ctx: OwnerContext, query: unknown): Promise<AuditTablePage> {
  return historyPage(await ownerDb(), undefined, query);
}

/** One tenant's history (details, houses, rent, months, payments, documents, messages), one page at a time. */
export async function tenantHistory(_ctx: OwnerContext, tenantId: string, query: unknown): Promise<AuditTablePage> {
  const db = await ownerDb();
  await requireTenant(db, tenantId);
  return historyPage(db, tenantId, query);
}

/** One house's history: its details and every tenancy that started or ended in it. */
export async function unitHistory(_ctx: OwnerContext, unitCode: string, query: unknown): Promise<AuditPage> {
  const parsed = unitCodeSchema.safeParse(unitCode);
  if (!parsed.success) notFound("House");
  const { before } = parseInput(auditPageSchema, query);
  const db = await ownerDb();
  if ((await db.units.list({ unitCodes: [parsed.data] })).length === 0) notFound("House");
  return page(db, { unitCode: parsed.data, beforeId: before });
}
