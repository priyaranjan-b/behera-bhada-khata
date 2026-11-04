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
  const [settledBy] = expense.settled_by_payment_id
    ? await executeRows<{ receipt_no: string | null }>(
        tx,
        sql`select receipt_no from payments where id = ${expense.settled_by_payment_id}::uuid`
      )
    : [];
  return {
    expense,
    units: units.map((u) => ({ ...u, share_amount: Number(u.share_amount) })),
    tags: tags.map((t) => t.name),
    files,
    settled_by_receipt_no: settledBy?.receipt_no ?? null,
  };
}

/** Spent per month of expense_date, and of it paid in cash (A22, A23); voided excluded. */
export async function maintenanceMonthly(
  tx: Tx,
  fromMonth: string,
  toMonth: string
): Promise<{ month: string; amount: number; cash: number }[]> {
  const rows = await executeRows<{ month: string; amount: string; cash: string }>(
    tx,
    sql`select to_char(date_trunc('month', expense_date), 'YYYY-MM-DD') as month,
        sum(amount)::text as amount,
        coalesce(sum(amount) filter (where settled_by_payment_id is null), 0)::text as cash
      from maintenance_expenses
      where voided_at is null
        and expense_date >= ${fromMonth}::date
        and expense_date < (${toMonth}::date + interval '1 month')
      group by 1
      order by 1`
  );
  return rows.map((r) => ({ month: r.month, amount: Number(r.amount), cash: Number(r.cash) }));
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
