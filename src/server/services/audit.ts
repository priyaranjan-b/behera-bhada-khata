import "server-only";
import type { ActivityQuery, AuditEntry, AuditPage } from "@/lib/contracts";
import { actionsInCategory, AUDIT_ACTOR_LABELS } from "@/lib/domain/audit";
import { tenantDisplayName } from "@/lib/domain/tenant";
import type { AuditLogEntry } from "@/lib/types";
import { activityQuerySchema, AUDIT_LIMITS, auditPageSchema, unitCodeSchema } from "@/lib/validation";
import { auth, ownerDb, systemDb } from "@/server/infra";
import type { AuditEvent, AuditFilter, OwnerRepositories, SystemRepositories } from "@/server/ports";
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

async function page(db: OwnerRepositories, filter: Omit<AuditFilter, "limit">): Promise<AuditPage> {
  // One extra row says whether there is another page.
  const [rows, tenants, names] = await Promise.all([
    db.audit.list({ ...filter, limit: AUDIT_LIMITS.pageSize + 1 }),
    db.tenants.list(),
    auth.ownerNames(),
  ]);
  const more = rows.length > AUDIT_LIMITS.pageSize;
  const shown = more ? rows.slice(0, AUDIT_LIMITS.pageSize) : rows;
  const tenantNames = new Map(tenants.map((t) => [t.id, tenantDisplayName(t)]));
  const ownerName = names?.owner ?? AUDIT_ACTOR_LABELS.owner;
  return {
    entries: shown.map((row) => toEntry(row, row.tenant_id ? (tenantNames.get(row.tenant_id) ?? null) : null, ownerName)),
    nextBefore: more ? shown[shown.length - 1].id : null,
  };
}

function toEntry(row: AuditLogEntry, tenantName: string | null, ownerName: string): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    txId: row.tx_id,
    actorKind: row.actor_kind,
    actorName: row.actor_kind === "owner" ? ownerName : AUDIT_ACTOR_LABELS[row.actor_kind],
    action: row.action,
    entityId: row.entity_id,
    tenantId: row.tenant_id,
    tenantName,
    unitCode: row.unit_code,
    propertyCode: row.property_code,
    changes: row.changes,
    context: row.context,
  };
}

/** Everything that changed, newest first: the Activity page. */
export async function listActivity(_ctx: OwnerContext, query: unknown): Promise<AuditPage> {
  const q: ActivityQuery = parseInput(activityQuerySchema, query);
  return page(await ownerDb(), {
    actions: q.category ? actionsInCategory(q.category) : undefined,
    fromDate: q.from,
    toDate: q.to,
    beforeId: q.before,
  });
}

/** One tenant's history: details, houses, rent, months, payments, documents, messages. */
export async function tenantHistory(_ctx: OwnerContext, tenantId: string, query: unknown): Promise<AuditPage> {
  const { before } = parseInput(auditPageSchema, query);
  const db = await ownerDb();
  await requireTenant(db, tenantId);
  return page(db, { tenantId, beforeId: before });
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
