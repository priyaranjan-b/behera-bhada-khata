import "server-only";
import { sql } from "drizzle-orm";
import type { MaintenanceExpenseFields, NewMaintenanceFile } from "@/server/ports";
import { executeRows, type Tx } from "../client";
import { addMaintenanceFiles } from "../tables/maintenance";
import { setRecordTags } from "../tables/paymentTags";
import { textArray } from "./params";

// Maintenance expenses (0031, D35): the expense and its houses are written by
// SQL functions, so the equal split always adds up to the amount and the
// owner role keeps its direct writes revoked. Tags and files are plain owner
// writes, made in the same transaction as the expense.

function fieldArgs(id: string, f: MaintenanceExpenseFields, unitCodes: string[]) {
  return sql`
    p_id => ${id}::uuid,
    p_expense_date => ${f.expense_date}::date,
    p_amount => ${f.amount}::numeric,
    p_category => ${f.category}::text,
    p_description => ${f.description}::text,
    p_vendor => ${f.vendor}::text,
    p_note => ${f.note}::text,
    p_unit_codes => ${textArray(unitCodes)}`;
}

export async function createMaintenanceExpense(
  tx: Tx,
  id: string,
  fields: MaintenanceExpenseFields,
  unitCodes: string[],
  tags: string[],
  files: NewMaintenanceFile[]
): Promise<void> {
  await executeRows(tx, sql`select create_maintenance_expense(${fieldArgs(id, fields, unitCodes)})`);
  if (tags.length > 0) await setRecordTags(tx, "maintenance", id, tags);
  await addMaintenanceFiles(tx, files);
}

export async function updateMaintenanceExpense(tx: Tx, id: string, fields: MaintenanceExpenseFields, unitCodes: string[]): Promise<void> {
  await executeRows(tx, sql`select update_maintenance_expense(${fieldArgs(id, fields, unitCodes)})`);
}

export async function voidMaintenanceExpense(tx: Tx, id: string, reason: string): Promise<void> {
  await executeRows(tx, sql`select void_maintenance_expense(p_id => ${id}::uuid, p_reason => ${reason}::text)`);
}
