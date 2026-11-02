import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { DATE_FORMAT } from "@/lib/dates";
import { NOT_SET } from "@/lib/domain/tenant";

// What the server-paged tables show, written as SQL so search, filters and
// sort run on the same text the user sees. Each one is built from the app's
// own source of truth (src/lib/dates.ts, src/lib/domain/*), replacing the
// SQL copies (audit_date and audit_month as used by the page functions,
// payment_mode_label, status_label, tenant_placement_now). A test
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
 * The towers of the houses a tenant holds on `today` (yyyy-MM-dd), or held
 * last once moved out, as "Tower 1, Tower 2" by first house code; "—" with
 * none (tenant_placement_now's property_name, 0021; currentPlacement in
 * src/server/services/placements.ts). `today` comes from the app's clock
 * (todayKey), like every page.
 */
export function towersNow(tenantId: SQL, today: string): SQL {
  const holds = (endDate: SQL) => sql`(${endDate} is null or ${endDate} >= ${today}::date)`;
  return sql`coalesce((
    select string_agg(x.property_name, ', ' order by x.first_code)
    from (
      select coalesce(pr.name, u.property_code) as property_name, min(tu.unit_code) as first_code
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
      group by 1
    ) x
  ), ${NOT_SET})`;
}
