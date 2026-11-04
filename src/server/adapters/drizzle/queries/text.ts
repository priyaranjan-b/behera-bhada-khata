import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { DATE_FORMAT } from "@/lib/dates";
import { NOT_SET } from "@/lib/domain/tenant";

// What the server-paged tables show, written as SQL so search, filters and
// sort run on the same text the user sees. Each one is built from the app's
// own source of truth (src/lib/dates.ts, src/lib/domain/*), replacing the
// SQL copies (audit_date and audit_month as used by the page functions, which
// stay for audit_describe; payment_mode_label, status_label and
// tenant_placement_now, dropped in 0029, D33). A test
// compares each with the TS function the UI uses.

/**
 * 04/10/2026, as formatDateKey. to_char spells this format with the same
 * tokens as dayjs (DD/MM/YYYY); a test keeps the two equal.
 */
export const dateLabel = (date: SQL) => sql`to_char(${date}, ${DATE_FORMAT})`;

/** March 2026, as formatMonth(key) (long). */
export const monthLabel = (month: SQL) => sql`to_char(${month}, 'FMMonth YYYY')`;

/** A value's label from a TS label map; anything not in it gets `fallback` (paymentModeLabel and friends). */
export function labelOf(value: SQL, labels: Record<string, string>, fallback: string): SQL {
  const cases = Object.entries(labels).map(([key, label]) => sql`when ${key} then ${label}`);
  return sql`(case ${value} ${sql.join(cases, sql` `)} else ${fallback} end)`;
}

/** The name a table shows for a tenant: the business name if any, else the person's. */
export const tenantDisplayName = (businessName: SQL, name: SQL) => sql`coalesce(nullif(${businessName}, ''), ${name}, ${NOT_SET})`;

/**
 * The houses a tenant holds on `today` (yyyy-MM-dd), or held last once moved
 * out (as the dropped tenant_placement_now did, 0021; currentPlacement in
 * src/server/services/placements.ts), as rows (unit_code, property_name) to
 * select from. `today` comes from the app's clock (todayKey), like every page.
 */
function housesNow(tenantId: SQL, today: string): SQL {
  const holds = (endDate: SQL) => sql`(${endDate} is null or ${endDate} >= ${today}::date)`;
  return sql`(
    select tu.unit_code, coalesce(pr.name, u.property_code) as property_name
    from tenant_units tu
    join units u on u.unit_code = tu.unit_code
    left join properties pr on pr.property_code = u.property_code
    where tu.tenant_id = ${tenantId}
      and (
        ${holds(sql`tu.end_date`)}
        or (
          not exists (select 1 from tenant_units h where h.tenant_id = ${tenantId} and ${holds(sql`h.end_date`)})
          and tu.end_date = (select max(h.end_date) from tenant_units h where h.tenant_id = ${tenantId})
        )
      )
  )`;
}

/** Their towers, as "Tower 1, Tower 2" by first house code; NOT_SET with none. */
export function towersNow(tenantId: SQL, today: string): SQL {
  return sql`coalesce((
    select string_agg(x.property_name, ', ' order by x.first_code)
    from (select h.property_name, min(h.unit_code) as first_code from ${housesNow(tenantId, today)} h group by 1) x
  ), ${NOT_SET})`;
}

/** Their house codes, sorted; empty with none. */
export function unitCodesNow(tenantId: SQL, today: string): SQL {
  return sql`coalesce((select array_agg(h.unit_code order by h.unit_code) from ${housesNow(tenantId, today)} h), '{}'::text[])`;
}

/**
 * A payment's tags (0030, D34), for a `left join lateral (...) as tags on
 * true`: `tags.names` a json array and `tags.text` the names joined with
 * ", ", both alphabetical (any case), as the Tags column shows them.
 */
export function paymentTagsOf(paymentId: SQL): SQL {
  return tagsOf(sql`payment_record_tags`, sql`payment_id`, paymentId);
}

/** A maintenance expense's "paid by" tags (0031), as paymentTagsOf. */
export function maintenanceTagsOf(expenseId: SQL): SQL {
  return tagsOf(sql`maintenance_expense_tags`, sql`expense_id`, expenseId);
}

function tagsOf(table: SQL, key: SQL, id: SQL): SQL {
  return sql`
    select coalesce(json_agg(rt.name order by lower(rt.name), rt.name), '[]'::json) as names,
      coalesce(string_agg(rt.name, ', ' order by lower(rt.name), rt.name), '') as text
    from ${table} rt
    where rt.${key} = ${id}`;
}
