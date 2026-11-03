-- ROLLBACK for 0029 only. Not a migration: never in supabase/migrations, so
-- a fresh setup never runs it. It re-creates the 30 functions 0029 dropped
-- (A19, D33 in docs/database-design.md), exactly as 0028 left them:
-- definitions and EXECUTE grants, dumped with pg_get_functiondef from a
-- database migrated to 0028. test/schema.test.ts checks it restores the same
-- definitions and grants.
--
-- Run it in the SQL editor only if a deployment older than the Drizzle-only
-- release (commit 24be8bd) must serve traffic again after 0029: that release
-- still calls these. It re-grants 28 of them to `authenticated` (callable
-- with the publishable key, as before 0029) and the two rate-limit
-- functions to `service_role`. Safe to run more than once.
--
-- The tests also load it as a reference ("oracle"; loadOracles in
-- test/db/pglite.ts):
--   * the Drizzle parity tests (test/adapters/drizzle/queries/*,
--     rateLimits.test.ts, createLedgerDb({ oracles: true })) check the
--     TypeScript queries answer exactly what these did, over whole matrices
--     of filters, sorts and pages;
--   * the fixed-value cases in test/schema.test.ts pin what these answer,
--     and that they agree with the JS rules (summarizeBalance,
--     paidDirectMonths, the label maps).
-- So the TS queries are pinned to fixed values through these.
--
-- Frozen: never regenerated, and never edit a function here to make a test
-- pass. When a page's rules change on purpose, change the query and give
-- that parity case fixed expected values. Once no case needs it any more,
-- delete this file, loadOracles, the `oracles: true` options and the
-- fixed-value cases in test/schema.test.ts together.
--
-- Depends on what 0029 keeps: audit_date and audit_month (0017/0024, used by
-- audit_describe) and allocation_rows (0020).

begin;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.prune_rate_limits()
 RETURNS integer
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  with deleted as (
    delete from rate_limits where window_start < now() - interval '1 day' returning 1
  )
  select count(*)::integer from deleted;
$function$;
revoke all on function prune_rate_limits() from public, anon, authenticated, service_role;
grant execute on function prune_rate_limits() to service_role;

CREATE OR REPLACE FUNCTION public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into v_count;
  return v_count <= p_limit;
end;
$function$;
revoke all on function hit_rate_limit(text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function hit_rate_limit(text,integer,integer) to service_role;

CREATE OR REPLACE FUNCTION public.app_current_month()
 RETURNS date
 LANGUAGE sql
 STABLE
AS $function$
  select date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date
$function$;
revoke all on function app_current_month() from public, anon, authenticated, service_role;
grant execute on function app_current_month() to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.tenant_account_summary(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'total_outstanding', coalesce(sum(r.amount_due - r.amount_allocated)
      filter (where r.period_month < m.cur and r.amount_due > r.amount_allocated), 0),
    'overdue_months', count(r.id) filter (where r.period_month < m.cur and r.amount_due > r.amount_allocated),
    'not_yet_due', coalesce(sum(r.amount_due - r.amount_allocated)
      filter (where r.period_month >= m.cur and r.amount_due > r.amount_allocated), 0),
    'ended_months', count(r.id) filter (where r.period_month < m.cur),
    'paid_ended_months', count(r.id) filter (where r.period_month < m.cur and r.status = 'paid'),
    'can_stop_rent_tracking', exists (
      select 1 from tenants t
      where t.id = p_tenant_id
        and t.tenant_kind = 'government' and t.status = 'active' and t.rent_tracked
        and not exists (select 1 from payments p where p.tenant_id = t.id)
        and not exists (select 1 from adjustments a where a.tenant_id = t.id)
        and not exists (select 1 from rent_periods x where x.tenant_id = t.id and x.amount_allocated <> 0)
    )
  )
  from (select app_current_month() as cur) m
  left join rent_periods r on r.tenant_id = p_tenant_id
$function$;
revoke all on function tenant_account_summary(uuid) from public, anon, authenticated, service_role;
grant execute on function tenant_account_summary(uuid) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.tenant_placement_now(p_tenant_id uuid, OUT property_name text, OUT unit_codes text[])
 RETURNS record
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with history as (
    select tu.unit_code, tu.end_date, coalesce(p.name, u.property_code) as property_name
    from tenant_units tu
    join units u on u.unit_code = tu.unit_code
    left join properties p on p.property_code = u.property_code
    where tu.tenant_id = p_tenant_id
  ),
  holding as (
    select * from history
    where end_date is null or end_date >= (now() at time zone 'Asia/Kolkata')::date
  ),
  current_houses as (
    select * from holding
    union all
    select * from history
    where not exists (select 1 from holding)
      and end_date = (select max(end_date) from history)
  )
  select
    coalesce(
      (select string_agg(n, ', ' order by first_code)
       from (select property_name as n, min(unit_code) as first_code from current_houses group by property_name) t),
      '—'
    ),
    coalesce((select array_agg(unit_code order by unit_code) from current_houses), '{}')
$function$;
revoke all on function tenant_placement_now(uuid) from public, anon, authenticated, service_role;
grant execute on function tenant_placement_now(uuid) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.payment_mode_label(p_mode text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_mode
    when 'cash' then 'Cash'
    when 'bank_transfer' then 'Bank transfer'
    when 'upi' then 'UPI'
    when 'cheque' then 'Cheque'
    else 'Other'
  end
$function$;
revoke all on function payment_mode_label(text) from public, anon, authenticated, service_role;
grant execute on function payment_mode_label(text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.status_label(p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select upper(left(replace(p_status, '_', ' '), 1)) || substr(replace(p_status, '_', ' '), 2)
$function$;
revoke all on function status_label(text) from public, anon, authenticated, service_role;
grant execute on function status_label(text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.period_display_status(p_period_month date, p_status text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case when p_period_month >= app_current_month() and p_status <> 'paid' then 'not_due_yet' else p_status end
$function$;
revoke all on function period_display_status(date,text) from public, anon, authenticated, service_role;
grant execute on function period_display_status(date,text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.like_escape(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_')
$function$;
revoke all on function like_escape(text) from public, anon, authenticated, service_role;
grant execute on function like_escape(text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.audit_text_matches(p_text text, p_operator text, p_value text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(case
    when p_operator = 'isEmpty' then coalesce(btrim(p_text), '') = ''
    when p_operator = 'isNotEmpty' then coalesce(btrim(p_text), '') <> ''
    when coalesce(btrim(p_value), '') = '' then true
    when p_operator = 'contains' then p_text ilike '%' || like_escape(btrim(p_value)) || '%'
    when p_operator = 'equals' then lower(p_text) = lower(btrim(p_value))
    when p_operator = 'startsWith' then p_text ilike like_escape(btrim(p_value)) || '%'
    when p_operator = 'endsWith' then p_text ilike '%' || like_escape(btrim(p_value))
  end, false)
$function$;
revoke all on function audit_text_matches(text,text,text) from public, anon, authenticated, service_role;
grant execute on function audit_text_matches(text,text,text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.grid_active_filters(p_filters jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(
    (select jsonb_agg(f) from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
     where f ->> 'operator' in ('isEmpty', 'isNotEmpty') or coalesce(btrim(f ->> 'value'), '') <> ''),
    '[]'::jsonb
  )
$function$;
revoke all on function grid_active_filters(jsonb) from public, anon, authenticated, service_role;
grant execute on function grid_active_filters(jsonb) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.grid_words(p_search text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(array_agg(w), '{}')
  from regexp_split_to_table(btrim(coalesce(p_search, '')), '\s+') as w
  where w <> ''
$function$;
revoke all on function grid_words(text) from public, anon, authenticated, service_role;
grant execute on function grid_words(text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.grid_row_matches(p_fields jsonb, p_search_text text, p_words text[], p_filters jsonb, p_logic text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$;
revoke all on function grid_row_matches(jsonb,text,text[],jsonb,text) from public, anon, authenticated, service_role;
grant execute on function grid_row_matches(jsonb,text,text[],jsonb,text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.grid_check(p_sort text, p_sorts text[], p_dir text, p_logic text, p_page integer, p_page_size integer, p_filters jsonb, p_fields text[])
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
$function$;
revoke all on function grid_check(text,text[],text,text,integer,integer,jsonb,text[]) from public, anon, authenticated, service_role;
grant execute on function grid_check(text,text[],text,text,integer,integer,jsonb,text[]) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.audit_field(p_row audit_log, p_tenant_name text, p_field text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_field
    when 'actor_name' then p_row.actor_name
    when 'title' then p_row.title
    when 'tenant_name' then p_tenant_name
    when 'unit_code' then p_row.unit_code
    when 'details' then p_row.details
  end
$function$;
revoke all on function audit_field(audit_log,text,text) from public, anon, authenticated, service_role;
grant execute on function audit_field(audit_log,text,text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.audit_matches(p_row audit_log, p_tenant_name text, p_actions text[], p_from date, p_to date, p_words text[], p_filters jsonb, p_logic text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select (p_actions is null or p_row.action = any (p_actions))
    and (p_from is null or (p_row.at at time zone 'Asia/Kolkata')::date >= p_from)
    and (p_to is null or (p_row.at at time zone 'Asia/Kolkata')::date <= p_to)
    and not exists (
      select 1 from unnest(p_words) as w
      where not (
        concat_ws(E'\n', p_row.actor_name, p_row.title, p_tenant_name, p_row.unit_code, p_row.details)
          ilike '%' || like_escape(w) || '%'
      )
    )
    and case
      when p_logic = 'or' then
        not exists (select 1 from jsonb_array_elements(p_filters))
        or exists (
          select 1 from jsonb_array_elements(p_filters) as f
          where audit_text_matches(audit_field(p_row, p_tenant_name, f ->> 'field'), f ->> 'operator', f ->> 'value')
        )
      else
        not exists (
          select 1 from jsonb_array_elements(p_filters) as f
          where not audit_text_matches(audit_field(p_row, p_tenant_name, f ->> 'field'), f ->> 'operator', f ->> 'value')
        )
    end
$function$;
revoke all on function audit_matches(audit_log,text,text[],date,date,text[],jsonb,text) from public, anon, authenticated, service_role;
grant execute on function audit_matches(audit_log,text,text[],date,date,text[],jsonb,text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.audit_history_page(p_tenant_id uuid DEFAULT NULL::uuid, p_actions text[] DEFAULT NULL::text[], p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '[]'::jsonb, p_logic text DEFAULT 'and'::text, p_sort text DEFAULT 'at'::text, p_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_words text[] := array(
    select w from regexp_split_to_table(btrim(coalesce(p_search, '')), '\s+') as w where w <> ''
  );
  v_filters jsonb;
  v_total int;
  v_all int;
  v_page int;
  v_rows jsonb;
begin
  if p_sort not in ('at', 'actor_name', 'title', 'tenant_name', 'unit_code')
    or p_dir not in ('asc', 'desc')
    or p_logic not in ('and', 'or')
    or p_page < 0
    or p_page_size not between 1 and 100
    or jsonb_typeof(coalesce(p_filters, '[]'::jsonb)) <> 'array'
  then
    raise exception 'That history query isn''t valid' using errcode = 'BBK00';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
    where f ->> 'field' is null or f ->> 'field' not in ('actor_name', 'title', 'tenant_name', 'unit_code', 'details')
      or f ->> 'operator' is null
      or f ->> 'operator' not in ('contains', 'equals', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty')
  ) then
    raise exception 'That history filter isn''t valid' using errcode = 'BBK00';
  end if;

  -- Only filters that filter: one with a value, or an empty / not-empty check.
  v_filters := coalesce(
    (select jsonb_agg(f) from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
     where f ->> 'operator' in ('isEmpty', 'isNotEmpty') or coalesce(btrim(f ->> 'value'), '') <> ''),
    '[]'::jsonb
  );

  select count(*) into v_all from audit_log a where p_tenant_id is null or a.tenant_id = p_tenant_id;

  with named as (
    select a, coalesce(nullif(t.business_name, ''), t.name) as tenant_name
    from audit_log a
    left join tenants t on t.id = a.tenant_id
    where p_tenant_id is null or a.tenant_id = p_tenant_id
  )
  select count(*) into v_total from named
  where audit_matches(named.a, named.tenant_name, p_actions, p_from, p_to, v_words, v_filters, p_logic);
  v_page := least(p_page, greatest(0, ceil(v_total::numeric / p_page_size)::int - 1));

  with named as (
    select a, coalesce(nullif(t.business_name, ''), t.name) as tenant_name
    from audit_log a
    left join tenants t on t.id = a.tenant_id
    where p_tenant_id is null or a.tenant_id = p_tenant_id
  )
  select coalesce(jsonb_agg(x.row order by x.n), '[]'::jsonb) into v_rows
  from (
    select to_jsonb(named.a) as row,
      row_number() over (
        order by
          case when p_dir = 'asc' then lower(audit_field(named.a, named.tenant_name, p_sort)) end asc nulls last,
          case when p_dir = 'desc' then lower(audit_field(named.a, named.tenant_name, p_sort)) end desc nulls last,
          case when p_sort = 'at' and p_dir = 'asc' then (named.a).id end asc,
          (named.a).id desc
      ) as n
    from named
    where audit_matches(named.a, named.tenant_name, p_actions, p_from, p_to, v_words, v_filters, p_logic)
  ) as x
  where x.n > v_page * p_page_size and x.n <= (v_page + 1) * p_page_size;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'all', v_all, 'page', v_page);
end;
$function$;
revoke all on function audit_history_page(uuid,text[],date,date,text,jsonb,text,text,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function audit_history_page(uuid,text[],date,date,text,jsonb,text,text,text,integer,integer) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.tenant_month_rows(p_tenant_id uuid)
 RETURNS TABLE(id uuid, period_month date, amount_due numeric, amount_allocated numeric, status text, display_status text, month_label text, status_label text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select r.id, r.period_month, r.amount_due, r.amount_allocated, r.status,
    d.display_status, audit_month(r.period_month), status_label(d.display_status)
  from rent_periods r
  cross join lateral (select period_display_status(r.period_month, r.status) as display_status) d
  where r.tenant_id = p_tenant_id
$function$;
revoke all on function tenant_month_rows(uuid) from public, anon, authenticated, service_role;
grant execute on function tenant_month_rows(uuid) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.tenant_months_matching(p_tenant_id uuid, p_show text, p_words text[], p_filters jsonb, p_logic text)
 RETURNS TABLE(id uuid, period_month date, amount_due numeric, amount_allocated numeric, status text, display_status text, month_label text, status_label text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$;
revoke all on function tenant_months_matching(uuid,text,text[],jsonb,text) from public, anon, authenticated, service_role;
grant execute on function tenant_months_matching(uuid,text,text[],jsonb,text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.tenant_months_page(p_tenant_id uuid, p_show text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '[]'::jsonb, p_logic text DEFAULT 'and'::text, p_sort text DEFAULT 'period_month'::text, p_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$;
revoke all on function tenant_months_page(uuid,text,text,jsonb,text,text,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function tenant_months_page(uuid,text,text,jsonb,text,text,text,integer,integer) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.tenant_ledger_rows(p_tenant_id uuid)
 RETURNS TABLE(id text, type text, date date, description text, caption text, debit numeric, credit numeric, balance numeric, status text, status_label text, date_label text, ref_id uuid, receipt_no text, acknowledged boolean, ord bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with journal as (
    select 'charge-' || r.id as id, 'charge' as type, r.period_month as date,
      'Rent due — ' || audit_month(r.period_month) as description,
      r.amount_due as debit, 0::numeric as credit,
      case when r.period_month < app_current_month() then 'billed' else 'upcoming' end as status,
      null::uuid as ref_id, null::text as receipt_no, null::boolean as acknowledged, r.created_at as recorded_at
    from rent_periods r
    where r.tenant_id = p_tenant_id
    union all
    select 'payment-' || p.id, 'payment', p.payment_date,
      'Payment received (' || replace(p.mode, '_', ' ') || ')' || coalesce(' — ' || nullif(p.note, ''), ''),
      0, p.amount,
      case when p.status = 'confirmed' then 'confirmed' else 'pending' end,
      p.id, p.receipt_no, p.acknowledged_at is not null, p.created_at
    from payments p
    where p.tenant_id = p_tenant_id
    union all
    select 'adjustment-' || a.id, 'adjustment', (coalesce(a.confirmed_at, a.created_at) at time zone 'Asia/Kolkata')::date,
      'Adjustment — ' || a.reason,
      case when a.delta_amount < 0 then -a.delta_amount else 0 end,
      case when a.delta_amount > 0 then a.delta_amount else 0 end,
      case when a.status = 'confirmed' then 'confirmed' else 'pending' end,
      a.id, a.receipt_no, a.acknowledged_at is not null, a.created_at
    from adjustments a
    where a.tenant_id = p_tenant_id
  ),
  ordered as (
    select j.*, row_number() over (order by j.date, j.type, j.recorded_at, j.id) as ord
    from journal j
  )
  select o.id, o.type, o.date, o.description,
    case
      when o.type = 'charge' then 'Charge'
      else coalesce('#' || o.receipt_no, initcap(o.type))
        || ' · ' || case when o.acknowledged then 'signed by tenant' else 'not signed by tenant' end
    end,
    o.debit, o.credit,
    sum(case when o.status in ('pending', 'upcoming') then 0 else o.debit - o.credit end) over (order by o.ord),
    o.status,
    case o.status when 'billed' then '' when 'upcoming' then 'Not due yet' else status_label(o.status) end,
    audit_date(o.date),
    o.ref_id, o.receipt_no, o.acknowledged, o.ord
  from ordered o
$function$;
revoke all on function tenant_ledger_rows(uuid) from public, anon, authenticated, service_role;
grant execute on function tenant_ledger_rows(uuid) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.tenant_ledger_matching(p_tenant_id uuid, p_from date, p_to date, p_words text[], p_filters jsonb, p_logic text)
 RETURNS TABLE(id text, type text, date date, description text, caption text, debit numeric, credit numeric, balance numeric, status text, status_label text, date_label text, ref_id uuid, receipt_no text, acknowledged boolean, ord bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select l.* from tenant_ledger_rows(p_tenant_id) l
  where (p_from is null or l.date >= p_from)
    and (p_to is null or l.date <= p_to)
    and grid_row_matches(
      jsonb_build_object('date', l.date_label, 'description', l.description || E'\n' || l.caption, 'status', l.status_label),
      concat_ws(E'\n', l.date_label, l.description, l.caption, l.status_label),
      p_words, p_filters, p_logic
    )
$function$;
revoke all on function tenant_ledger_matching(uuid,date,date,text[],jsonb,text) from public, anon, authenticated, service_role;
grant execute on function tenant_ledger_matching(uuid,date,date,text[],jsonb,text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.tenant_ledger_page(p_tenant_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '[]'::jsonb, p_logic text DEFAULT 'and'::text, p_sort text DEFAULT 'date'::text, p_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_words text[] := grid_words(p_search);
  v_filters jsonb;
  v_total int;
  v_all int;
  v_page int;
  v_rows jsonb;
begin
  perform grid_check(
    p_sort, array['date', 'description', 'status', 'debit', 'credit', 'balance'], p_dir, p_logic, p_page, p_page_size,
    p_filters, array['date', 'description', 'status']
  );
  v_filters := grid_active_filters(p_filters);

  select count(*) into v_all from tenant_ledger_rows(p_tenant_id);
  select count(*) into v_total from tenant_ledger_matching(p_tenant_id, p_from, p_to, v_words, v_filters, p_logic);
  v_page := least(p_page, greatest(0, ceil(v_total::numeric / p_page_size)::int - 1));

  select coalesce(jsonb_agg(x.row order by x.n), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
        'id', l.id, 'type', l.type, 'date', l.date, 'description', l.description, 'caption', l.caption,
        'debit', l.debit, 'credit', l.credit, 'balance', l.balance, 'status', l.status,
        'ref_id', l.ref_id, 'receipt_no', l.receipt_no, 'acknowledged', l.acknowledged
      ) as row,
      row_number() over (
        order by
          case when p_sort = 'description' and p_dir = 'asc' then lower(l.description) end asc,
          case when p_sort = 'description' and p_dir = 'desc' then lower(l.description) end desc,
          case when p_sort = 'status' and p_dir = 'asc' then l.status_label end asc,
          case when p_sort = 'status' and p_dir = 'desc' then l.status_label end desc,
          case when p_sort = 'debit' and p_dir = 'asc' then l.debit end asc,
          case when p_sort = 'debit' and p_dir = 'desc' then l.debit end desc,
          case when p_sort = 'credit' and p_dir = 'asc' then l.credit end asc,
          case when p_sort = 'credit' and p_dir = 'desc' then l.credit end desc,
          case when p_sort = 'balance' and p_dir = 'asc' then l.balance end asc,
          case when p_sort = 'balance' and p_dir = 'desc' then l.balance end desc,
          case when p_sort = 'date' and p_dir = 'asc' then l.ord end asc,
          l.ord desc
      ) as n
    from tenant_ledger_matching(p_tenant_id, p_from, p_to, v_words, v_filters, p_logic) l
  ) as x
  where x.n > v_page * p_page_size and x.n <= (v_page + 1) * p_page_size;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'all', v_all, 'page', v_page);
end;
$function$;
revoke all on function tenant_ledger_page(uuid,date,date,text,jsonb,text,text,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function tenant_ledger_page(uuid,date,date,text,jsonb,text,text,text,integer,integer) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.billing_rows(p_from date, p_to date, p_paid_direct boolean)
 RETURNS TABLE(id text, tenant_id uuid, tenant_name text, property_name text, unit_codes text[], period_month date, month_label text, amount_due numeric, amount_allocated numeric, balance numeric, status text, not_yet_due boolean, paid_direct boolean, display_status text, status_label text, status_rank integer, payments jsonb, receipt_text text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with months as (
    select r.id::text as id, r.tenant_id, r.period_month, r.amount_due, r.amount_allocated, r.status, false as paid_direct
    from rent_periods r
    where r.period_month between p_from and p_to
    union all
    select 'paid-direct:' || t.id || ':' || to_char(m.month, 'YYYY-MM-DD'), t.id, m.month::date,
      rate.amount, rate.amount, 'paid', true
    from tenants t
    cross join lateral generate_series(
      greatest(p_from, date_trunc('month', t.lease_start)::date),
      least(
        p_to,
        coalesce(date_trunc('month', t.moved_out_on)::date, (app_current_month() + interval '2 months')::date),
        (app_current_month() + interval '2 months')::date
      ),
      interval '1 month'
    ) as m(month)
    cross join lateral (
      select coalesce(
        (select r.monthly_amount from tenant_rent_rates r
         where r.tenant_id = t.id and r.effective_month <= m.month::date
         order by r.effective_month desc limit 1),
        (select r.monthly_amount from tenant_rent_rates r
         where r.tenant_id = t.id order by r.effective_month limit 1)
      ) as amount
    ) as rate
    where p_paid_direct
      and not t.rent_tracked
      and t.status <> 'draft'
      and t.lease_start is not null
      and rate.amount > 0
  )
  select m.id, m.tenant_id, coalesce(nullif(t.business_name, ''), t.name, '—'), place.property_name, place.unit_codes,
    m.period_month, audit_month(m.period_month), m.amount_due, m.amount_allocated,
    greatest(0, m.amount_due - m.amount_allocated),
    m.status, m.period_month >= app_current_month(), m.paid_direct,
    d.display_status, status_label(d.display_status),
    case d.display_status
      when 'pending' then 4 when 'partially_paid' then 3 when 'not_due_yet' then 2 when 'paid' then 1 else 0
    end,
    coalesce(pay.list, '[]'::jsonb),
    case when m.paid_direct then 'Paid to your bank directly' else coalesce(pay.text, '') end
  from months m
  left join tenants t on t.id = m.tenant_id
  cross join lateral tenant_placement_now(m.tenant_id) as place
  cross join lateral (
    select case when m.paid_direct then 'paid_direct' else period_display_status(m.period_month, m.status) end as display_status
  ) as d
  left join lateral (
    select
      jsonb_agg(
        jsonb_build_object(
          'payment_id', p.id, 'receipt_no', p.receipt_no, 'payment_date', p.payment_date,
          'mode', p.mode, 'amount', pa.amount_allocated
        )
        order by p.payment_date, p.id
      ) as list,
      string_agg(coalesce(p.receipt_no, '—') || ' (' || audit_date(p.payment_date) || ')', ', ' order by p.payment_date, p.id) as text
    from payment_allocations pa
    join payments p on p.id = pa.payment_id and p.status = 'confirmed'
    where not m.paid_direct and pa.rent_period_id = m.id::uuid
  ) as pay on true
$function$;
revoke all on function billing_rows(date,date,boolean) from public, anon, authenticated, service_role;
grant execute on function billing_rows(date,date,boolean) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.billing_matching(p_from date, p_to date, p_paid_direct boolean, p_show text, p_words text[], p_filters jsonb, p_logic text)
 RETURNS TABLE(id text, tenant_id uuid, tenant_name text, property_name text, unit_codes text[], period_month date, month_label text, amount_due numeric, amount_allocated numeric, balance numeric, status text, not_yet_due boolean, paid_direct boolean, display_status text, status_label text, status_rank integer, payments jsonb, receipt_text text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select b.* from billing_rows(p_from, p_to, p_paid_direct) b
  where case p_show
      when 'unpaid' then b.display_status in ('pending', 'partially_paid')
      when 'partly' then b.display_status = 'partially_paid'
      when 'paid' then b.display_status in ('paid', 'paid_direct')
      when 'paidDirect' then b.display_status = 'paid_direct'
      when 'notDue' then b.display_status = 'not_due_yet'
      else true
    end
    and grid_row_matches(
      jsonb_build_object(
        'month', b.month_label, 'tenant', b.tenant_name || E'\n' || b.property_name,
        'status', b.status_label, 'payments', b.receipt_text
      ),
      concat_ws(E'\n', b.month_label, b.tenant_name, b.property_name, b.status_label, b.receipt_text),
      p_words, p_filters, p_logic
    )
$function$;
revoke all on function billing_matching(date,date,boolean,text,text[],jsonb,text) from public, anon, authenticated, service_role;
grant execute on function billing_matching(date,date,boolean,text,text[],jsonb,text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.billing_totals(p_from date, p_to date, p_paid_direct boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'billed', coalesce(sum(b.amount_due), 0),
    'collected', coalesce(sum(b.amount_allocated), 0),
    'balance', greatest(0, coalesce(sum(b.amount_due), 0) - coalesce(sum(b.amount_allocated), 0)),
    'overdue', coalesce(sum(greatest(0, b.amount_due - b.amount_allocated)) filter (where not b.not_yet_due), 0),
    'collection_rate', case when coalesce(sum(b.amount_due), 0) > 0
      then round(sum(b.amount_allocated) / sum(b.amount_due) * 100)::int end,
    'tenants', count(distinct b.tenant_id)
  )
  from billing_rows(p_from, p_to, p_paid_direct) b
$function$;
revoke all on function billing_totals(date,date,boolean) from public, anon, authenticated, service_role;
grant execute on function billing_totals(date,date,boolean) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.billing_page(p_from date, p_to date, p_paid_direct boolean DEFAULT true, p_show text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '[]'::jsonb, p_logic text DEFAULT 'and'::text, p_sort text DEFAULT 'amount_allocated'::text, p_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_words text[] := grid_words(p_search);
  v_filters jsonb;
  v_total int;
  v_all int;
  v_page int;
  v_rows jsonb;
begin
  perform grid_check(
    p_sort, array['period_month', 'tenant_name', 'amount_due', 'amount_allocated', 'balance', 'status'],
    p_dir, p_logic, p_page, p_page_size, p_filters, array['month', 'tenant', 'status', 'payments']
  );
  if p_show is null or p_show not in ('all', 'unpaid', 'partly', 'paid', 'paidDirect', 'notDue')
    or p_from is null or p_to is null or p_from > p_to
  then
    raise exception 'That table query isn''t valid' using errcode = 'BBK00';
  end if;
  v_filters := grid_active_filters(p_filters);

  select count(*) into v_all from billing_rows(p_from, p_to, p_paid_direct);
  select count(*) into v_total from billing_matching(p_from, p_to, p_paid_direct, p_show, v_words, v_filters, p_logic);
  v_page := least(p_page, greatest(0, ceil(v_total::numeric / p_page_size)::int - 1));

  select coalesce(jsonb_agg(x.row order by x.n), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
        'id', b.id, 'tenant_id', b.tenant_id, 'tenant_name', b.tenant_name, 'property_name', b.property_name,
        'unit_codes', to_jsonb(b.unit_codes), 'period_month', b.period_month, 'month_label', b.month_label,
        'amount_due', b.amount_due, 'amount_allocated', b.amount_allocated, 'balance', b.balance,
        'status', b.status, 'not_yet_due', b.not_yet_due, 'paid_direct', b.paid_direct, 'payments', b.payments
      ) as row,
      row_number() over (
        order by
          case when p_sort = 'period_month' and p_dir = 'asc' then b.period_month end asc,
          case when p_sort = 'period_month' and p_dir = 'desc' then b.period_month end desc,
          case when p_sort = 'tenant_name' and p_dir = 'asc' then lower(b.tenant_name) end asc,
          case when p_sort = 'tenant_name' and p_dir = 'desc' then lower(b.tenant_name) end desc,
          case when p_sort = 'amount_due' and p_dir = 'asc' then b.amount_due end asc,
          case when p_sort = 'amount_due' and p_dir = 'desc' then b.amount_due end desc,
          case when p_sort = 'amount_allocated' and p_dir = 'asc' then b.amount_allocated end asc,
          case when p_sort = 'amount_allocated' and p_dir = 'desc' then b.amount_allocated end desc,
          case when p_sort = 'balance' and p_dir = 'asc' then b.balance end asc,
          case when p_sort = 'balance' and p_dir = 'desc' then b.balance end desc,
          -- Status sorts by need: unpaid, partly paid, not due, paid, paid direct; then by balance.
          case when p_sort = 'status' and p_dir = 'asc' then b.status_rank end asc,
          case when p_sort = 'status' and p_dir = 'asc' then b.balance end asc,
          case when p_sort = 'status' and p_dir = 'desc' then b.status_rank end desc,
          case when p_sort = 'status' and p_dir = 'desc' then b.balance end desc,
          b.period_month desc,
          lower(b.tenant_name),
          b.id
      ) as n
    from billing_matching(p_from, p_to, p_paid_direct, p_show, v_words, v_filters, p_logic) b
  ) as x
  where x.n > v_page * p_page_size and x.n <= (v_page + 1) * p_page_size;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'all', v_all, 'page', v_page);
end;
$function$;
revoke all on function billing_page(date,date,boolean,text,text,jsonb,text,text,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function billing_page(date,date,boolean,text,text,jsonb,text,text,text,integer,integer) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.payments_rows(p_from date, p_to date)
 RETURNS TABLE(id uuid, receipt_no text, payment_date date, date_label text, tenant_id uuid, tenant_name text, property_name text, mode text, mode_label text, amount numeric, months_text text, note text, acknowledged boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select p.id, p.receipt_no, p.payment_date, audit_date(p.payment_date), p.tenant_id,
    coalesce(nullif(t.business_name, ''), t.name, '—'), place.property_name,
    p.mode, payment_mode_label(p.mode), p.amount, coalesce(months.text, ''), coalesce(p.note, ''),
    p.acknowledged_at is not null
  from payments p
  left join tenants t on t.id = p.tenant_id
  cross join lateral tenant_placement_now(p.tenant_id) as place
  left join lateral (
    select string_agg(audit_month(r.period_month), ', ' order by r.period_month) as text
    from payment_allocations pa
    join rent_periods r on r.id = pa.rent_period_id
    where pa.payment_id = p.id
  ) as months on true
  where p.status = 'confirmed' and p.payment_date between p_from and p_to
$function$;
revoke all on function payments_rows(date,date) from public, anon, authenticated, service_role;
grant execute on function payments_rows(date,date) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.payments_matching(p_from date, p_to date, p_words text[], p_filters jsonb, p_logic text)
 RETURNS TABLE(id uuid, receipt_no text, payment_date date, date_label text, tenant_id uuid, tenant_name text, property_name text, mode text, mode_label text, amount numeric, months_text text, note text, acknowledged boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select r.* from payments_rows(p_from, p_to) r
  where grid_row_matches(
    jsonb_build_object(
      'date', r.date_label, 'receipt', coalesce(r.receipt_no, ''), 'tenant', r.tenant_name || E'\n' || r.property_name,
      'mode', r.mode_label, 'months', r.months_text, 'note', r.note
    ),
    concat_ws(E'\n', r.date_label, r.receipt_no, r.tenant_name, r.property_name, r.mode_label, r.months_text, r.note),
    p_words, p_filters, p_logic
  )
$function$;
revoke all on function payments_matching(date,date,text[],jsonb,text) from public, anon, authenticated, service_role;
grant execute on function payments_matching(date,date,text[],jsonb,text) to service_role, authenticated;

CREATE OR REPLACE FUNCTION public.payments_page(p_from date, p_to date, p_search text DEFAULT NULL::text, p_filters jsonb DEFAULT '[]'::jsonb, p_logic text DEFAULT 'and'::text, p_sort text DEFAULT 'payment_date'::text, p_dir text DEFAULT 'desc'::text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_words text[] := grid_words(p_search);
  v_filters jsonb;
  v_total int;
  v_all int;
  v_page int;
  v_rows jsonb;
  v_totals jsonb;
begin
  perform grid_check(
    p_sort, array['payment_date', 'receipt_no', 'tenant_name', 'mode', 'amount'],
    p_dir, p_logic, p_page, p_page_size, p_filters, array['date', 'receipt', 'tenant', 'mode', 'months', 'note']
  );
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 730 then
    raise exception 'That table query isn''t valid' using errcode = 'BBK00';
  end if;
  v_filters := grid_active_filters(p_filters);

  select count(*) into v_all from payments p
  where p.status = 'confirmed' and p.payment_date between p_from and p_to;

  select count(*), jsonb_build_object(
      'amount', coalesce(sum(m.amount), 0),
      'count', count(*),
      'by_mode', jsonb_build_object(
        'cash', coalesce(sum(m.amount) filter (where m.mode = 'cash'), 0),
        'bank_transfer', coalesce(sum(m.amount) filter (where m.mode = 'bank_transfer'), 0),
        'upi', coalesce(sum(m.amount) filter (where m.mode = 'upi'), 0),
        'cheque', coalesce(sum(m.amount) filter (where m.mode = 'cheque'), 0),
        'other', coalesce(sum(m.amount) filter (where m.mode not in ('cash', 'bank_transfer', 'upi', 'cheque')), 0)
      )
    )
  into v_total, v_totals
  from payments_matching(p_from, p_to, v_words, v_filters, p_logic) m;
  v_page := least(p_page, greatest(0, ceil(v_total::numeric / p_page_size)::int - 1));

  select coalesce(jsonb_agg(x.row order by x.n), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
        'id', m.id, 'receipt_no', m.receipt_no, 'payment_date', m.payment_date, 'tenant_id', m.tenant_id,
        'tenant_name', m.tenant_name, 'property_name', m.property_name, 'mode', m.mode, 'amount', m.amount,
        'months_text', m.months_text, 'note', m.note, 'acknowledged', m.acknowledged
      ) as row,
      row_number() over (
        order by
          case when p_sort = 'payment_date' and p_dir = 'asc' then m.payment_date end asc,
          case when p_sort = 'payment_date' and p_dir = 'desc' then m.payment_date end desc,
          case when p_sort = 'receipt_no' and p_dir = 'asc' then m.receipt_no end asc,
          case when p_sort = 'receipt_no' and p_dir = 'desc' then m.receipt_no end desc,
          case when p_sort = 'tenant_name' and p_dir = 'asc' then lower(m.tenant_name) end asc,
          case when p_sort = 'tenant_name' and p_dir = 'desc' then lower(m.tenant_name) end desc,
          case when p_sort = 'mode' and p_dir = 'asc' then m.mode_label end asc,
          case when p_sort = 'mode' and p_dir = 'desc' then m.mode_label end desc,
          case when p_sort = 'amount' and p_dir = 'asc' then m.amount end asc,
          case when p_sort = 'amount' and p_dir = 'desc' then m.amount end desc,
          m.payment_date desc,
          m.receipt_no desc,
          m.id
      ) as n
    from payments_matching(p_from, p_to, v_words, v_filters, p_logic) m
  ) as x
  where x.n > v_page * p_page_size and x.n <= (v_page + 1) * p_page_size;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'all', v_all, 'page', v_page, 'totals', v_totals);
end;
$function$;
revoke all on function payments_page(date,date,text,jsonb,text,text,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function payments_page(date,date,text,jsonb,text,text,text,integer,integer) to service_role, authenticated;
reset check_function_bodies;

commit;
