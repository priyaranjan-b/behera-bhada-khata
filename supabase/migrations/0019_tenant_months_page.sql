-- A tenant's rent months, one page at a time (A15, D28).
--
-- The tenant page's Months table grows by a row every month, so it pages,
-- sorts, searches and filters in SQL like the history tables (0018).
--
-- The grid helpers below are shared by every server-side table (months,
-- ledger, billing); the history function keeps its own copy from 0018.
-- A table function builds, per row, a jsonb of the text it shows
-- ({field: text}); grid_row_matches() runs the search words and the grid's
-- text filters (audit_text_matches, 0017) over it.

-- 1. Grid helpers ---------------------------------------------------------------

-- The search box's words: every one must appear in the row.
create function grid_words(p_search text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(w), '{}')
  from regexp_split_to_table(btrim(coalesce(p_search, '')), '\s+') as w
  where w <> ''
$$;

-- Refuses a query the table doesn't offer: an unknown sort, direction,
-- logic, page size, or a filter on an unknown field or operator.
create function grid_check(
  p_sort text,
  p_sorts text[],
  p_dir text,
  p_logic text,
  p_page int,
  p_page_size int,
  p_filters jsonb,
  p_fields text[]
)
returns void
language plpgsql
immutable
as $$
begin
  if p_sort is null or not (p_sort = any (p_sorts))
    or p_dir not in ('asc', 'desc')
    or p_logic not in ('and', 'or')
    or p_page < 0
    or p_page_size not between 1 and 100
    or jsonb_typeof(coalesce(p_filters, '[]'::jsonb)) <> 'array'
  then
    raise exception 'That table query isn''t valid' using errcode = 'BBK00';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
    where f ->> 'field' is null or not ((f ->> 'field') = any (p_fields))
      or f ->> 'operator' is null
      or f ->> 'operator' not in ('contains', 'equals', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty')
  ) then
    raise exception 'That table filter isn''t valid' using errcode = 'BBK00';
  end if;
end;
$$;

-- Only filters that filter: one with a value, or an empty / not-empty check.
create function grid_active_filters(p_filters jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(
    (select jsonb_agg(f) from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
     where f ->> 'operator' in ('isEmpty', 'isNotEmpty') or coalesce(btrim(f ->> 'value'), '') <> ''),
    '[]'::jsonb
  )
$$;

-- Whether a row shows: every search word in its searchable text, and the
-- filters (combined with and / or) on the text of its fields.
create function grid_row_matches(p_fields jsonb, p_search_text text, p_words text[], p_filters jsonb, p_logic text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select not exists (
      select 1 from unnest(p_words) as w
      where not (coalesce(p_search_text, '') ilike '%' || like_escape(w) || '%')
    )
    and case
      when p_logic = 'or' then
        not exists (select 1 from jsonb_array_elements(p_filters))
        or exists (
          select 1 from jsonb_array_elements(p_filters) as f
          where audit_text_matches(p_fields ->> (f ->> 'field'), f ->> 'operator', f ->> 'value')
        )
      else
        not exists (
          select 1 from jsonb_array_elements(p_filters) as f
          where not audit_text_matches(p_fields ->> (f ->> 'field'), f ->> 'operator', f ->> 'value')
        )
    end
$$;

-- The first day of the current month in the app time zone (Asia/Kolkata).
create function app_current_month()
returns date
language sql
stable
as $$
  select date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date
$$;

-- "partially_paid" -> "Partially paid", as statusLabel (src/lib/domain/status.ts).
create function status_label(p_status text)
returns text
language sql
immutable
as $$
  select upper(left(replace(p_status, '_', ' '), 1)) || substr(replace(p_status, '_', ' '), 2)
$$;

-- A rent month as the app shows it: not due yet (this month or later, not
-- fully paid) or its stored status - periodDisplayStatus in src/lib/domain/billing.ts.
create function period_display_status(p_period_month date, p_status text)
returns text
language sql
stable
set search_path = public
as $$
  select case when p_period_month >= app_current_month() and p_status <> 'paid' then 'not_due_yet' else p_status end
$$;

-- 2. A tenant's months --------------------------------------------------------------

-- Every month of the tenant as the table shows it.
create function tenant_month_rows(p_tenant_id uuid)
returns table (
  id uuid, period_month date, amount_due numeric, amount_allocated numeric, status text,
  display_status text, month_label text, status_label text
)
language sql
stable
set search_path = public
as $$
  select r.id, r.period_month, r.amount_due, r.amount_allocated, r.status,
    d.display_status, audit_month(r.period_month), status_label(d.display_status)
  from rent_periods r
  cross join lateral (select period_display_status(r.period_month, r.status) as display_status) d
  where r.tenant_id = p_tenant_id
$$;

-- The months that pass "Show", the search and the filters.
create function tenant_months_matching(p_tenant_id uuid, p_show text, p_words text[], p_filters jsonb, p_logic text)
returns table (
  id uuid, period_month date, amount_due numeric, amount_allocated numeric, status text,
  display_status text, month_label text, status_label text
)
language sql
stable
set search_path = public
as $$
  select m.* from tenant_month_rows(p_tenant_id) m
  where case p_show
      when 'unpaid' then m.display_status in ('pending', 'partially_paid')
      when 'partly' then m.display_status = 'partially_paid'
      when 'paid' then m.display_status = 'paid'
      when 'notDue' then m.display_status = 'not_due_yet'
      else true
    end
    and grid_row_matches(
      jsonb_build_object('month', m.month_label, 'status', m.status_label),
      m.month_label || E'
' || m.status_label,
      p_words, p_filters, p_logic
    )
$$;

-- {rows, total, all, page}; a row is {id, period_month, amount_due,
-- amount_allocated, status, display_status, month_label}. Show: all |
-- unpaid (owed on a month that has ended) | partly (partially paid) | paid |
-- notDue. Security invoker: RLS (is_app_owner()) decides what the caller sees.
create function tenant_months_page(
  p_tenant_id uuid,
  p_show text default 'all',
  p_search text default null,
  p_filters jsonb default '[]'::jsonb,
  p_logic text default 'and',
  p_sort text default 'period_month',
  p_dir text default 'desc',
  p_page int default 0,
  p_page_size int default 10
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_words text[] := grid_words(p_search);
  v_filters jsonb;
  v_total int;
  v_all int;
  v_page int;
  v_rows jsonb;
begin
  perform grid_check(
    p_sort, array['period_month', 'amount_due', 'amount_allocated', 'status'], p_dir, p_logic, p_page, p_page_size,
    p_filters, array['month', 'status']
  );
  if p_show is null or p_show not in ('all', 'unpaid', 'partly', 'paid', 'notDue') then
    raise exception 'That table query isn''t valid' using errcode = 'BBK00';
  end if;
  v_filters := grid_active_filters(p_filters);

  select count(*) into v_all from tenant_month_rows(p_tenant_id);
  select count(*) into v_total from tenant_months_matching(p_tenant_id, p_show, v_words, v_filters, p_logic);
  v_page := least(p_page, greatest(0, ceil(v_total::numeric / p_page_size)::int - 1));

  select coalesce(jsonb_agg(x.row order by x.n), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
        'id', m.id, 'period_month', m.period_month, 'amount_due', m.amount_due,
        'amount_allocated', m.amount_allocated, 'status', m.status,
        'display_status', m.display_status, 'month_label', m.month_label
      ) as row,
      row_number() over (
        order by
          case when p_sort = 'amount_due' and p_dir = 'asc' then m.amount_due end asc,
          case when p_sort = 'amount_due' and p_dir = 'desc' then m.amount_due end desc,
          case when p_sort = 'amount_allocated' and p_dir = 'asc' then m.amount_allocated end asc,
          case when p_sort = 'amount_allocated' and p_dir = 'desc' then m.amount_allocated end desc,
          case when p_sort = 'status' and p_dir = 'asc' then m.status_label end asc,
          case when p_sort = 'status' and p_dir = 'desc' then m.status_label end desc,
          case when p_sort = 'period_month' and p_dir = 'asc' then m.period_month end asc,
          m.period_month desc
      ) as n
    from tenant_months_matching(p_tenant_id, p_show, v_words, v_filters, p_logic) m
  ) as x
  where x.n > v_page * p_page_size and x.n <= (v_page + 1) * p_page_size;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'all', v_all, 'page', v_page);
end;
$$;

-- 3. Grants ------------------------------------------------------------------------

-- The page function runs as the owner (security invoker), so the owner needs
-- every helper it calls; they read nothing RLS doesn't already allow.
revoke all on function grid_words(text) from public, anon, authenticated;
revoke all on function grid_check(text, text[], text, text, int, int, jsonb, text[]) from public, anon, authenticated;
revoke all on function grid_active_filters(jsonb) from public, anon, authenticated;
revoke all on function grid_row_matches(jsonb, text, text[], jsonb, text) from public, anon, authenticated;
revoke all on function app_current_month() from public, anon, authenticated;
revoke all on function status_label(text) from public, anon, authenticated;
revoke all on function period_display_status(date, text) from public, anon, authenticated;
revoke all on function tenant_month_rows(uuid) from public, anon, authenticated;
revoke all on function tenant_months_matching(uuid, text, text[], jsonb, text) from public, anon, authenticated;
revoke all on function tenant_months_page(uuid, text, text, jsonb, text, text, text, int, int) from public, anon, authenticated;

grant execute on function grid_words(text) to authenticated;
grant execute on function grid_check(text, text[], text, text, int, int, jsonb, text[]) to authenticated;
grant execute on function grid_active_filters(jsonb) to authenticated;
grant execute on function grid_row_matches(jsonb, text, text[], jsonb, text) to authenticated;
grant execute on function app_current_month() to authenticated;
grant execute on function status_label(text) to authenticated;
grant execute on function period_display_status(date, text) to authenticated;
grant execute on function tenant_month_rows(uuid) to authenticated;
grant execute on function tenant_months_matching(uuid, text, text[], jsonb, text) to authenticated;
grant execute on function tenant_months_page(uuid, text, text, jsonb, text, text, text, int, int) to authenticated;
-- audit_month (0017) formats the month label for the owner's query too.
grant execute on function audit_month(date) to authenticated;
