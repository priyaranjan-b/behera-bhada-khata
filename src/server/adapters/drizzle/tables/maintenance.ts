import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import type { MaintenanceFile } from "@/lib/types";
import type { MaintenanceExpenseRecord, NewMaintenanceFile } from "@/server/ports";
import { executeRows, type Tx } from "../client";
import { maintenanceExpenses, maintenanceFiles } from "../schema";

// Maintenance expenses (0031, D35): reads, and the files (added and deleted,
// never edited; the audit trigger records each). Under RLS.

/** The expense with its houses (and towers), who paid and its files; null if none. */
export async function getMaintenanceExpense(tx: Tx, id: string): Promise<MaintenanceExpenseRecord | null> {
  const [expense] = await tx.select().from(maintenanceExpenses).where(eq(maintenanceExpenses.id, id));
  if (!expense) return null;
  const units = await executeRows<{ unit_code: string; share_amount: string; property_code: string; property_name: string; label: string | null }>(
    tx,
    sql`select mu.unit_code, mu.share_amount::text as share_amount, u.property_code,
        coalesce(p.name, u.property_code) as property_name, u.label
      from maintenance_expense_units mu
      join units u on u.unit_code = mu.unit_code
      left join properties p on p.property_code = u.property_code
      where mu.expense_id = ${id}::uuid
      order by mu.unit_code`
  );
  const tags = await executeRows<{ name: string }>(
    tx,
    sql`select name from maintenance_expense_tags where expense_id = ${id}::uuid order by lower(name), name`
  );
  const files = await tx
    .select()
    .from(maintenanceFiles)
    .where(eq(maintenanceFiles.expense_id, id))
    .orderBy(asc(maintenanceFiles.created_at), asc(maintenanceFiles.storage_path));
  return {
    expense,
    units: units.map((u) => ({ ...u, share_amount: Number(u.share_amount) })),
    tags: tags.map((t) => t.name),
    files,
  };
}

/** All in one insert: every row or none. */
export async function addMaintenanceFiles(tx: Tx, rows: NewMaintenanceFile[]): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(maintenanceFiles).values(rows);
}

export async function getMaintenanceFile(tx: Tx, id: string): Promise<MaintenanceFile | null> {
  const [row] = await tx.select().from(maintenanceFiles).where(eq(maintenanceFiles.id, id));
  return row ?? null;
}

/** False if no such file. */
export async function removeMaintenanceFile(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx.delete(maintenanceFiles).where(eq(maintenanceFiles.id, id)).returning({ id: maintenanceFiles.id });
  return rows.length > 0;
}
