-- One paged history for every table of changes (A14, D27).
--
-- 0017 added tenant_history_page() for the tenant page's Change history.
-- The Activity page needs the same thing over the whole log, and searches,
-- filters and sorts by tenant too (its "Tenant / house" column). So:
--   * audit_history_page() replaces tenant_history_page(): the tenant is
--     optional (null = every change);
--   * the tenant's name - business name, else name, as tenantDisplayName in
--     src/lib/domain/tenant.ts - is searchable, filterable (tenant_name) and
--     sortable. It is read from tenants, so it is the current name; the
--     stored title / details / actor_name stay as written.

drop function tenant_history_page(uuid, text[], date, date, text, jsonb, text, text, text, int, int);
drop function audit_matches(audit_log, text[], date, date, text[], jsonb, text);
drop function audit_field(audit_log, text);

create function audit_field(p_row audit_log, p_tenant_name text, p_field text)
returns text
language sql
immutable
as $$
  select case p_field
    when 'actor_name' then p_row.actor_name
    when 'title' then p_row.title
    when 'tenant_name' then p_tenant_name
    when 'unit_code' then p_row.unit_code
    when 'details' then p_row.details
  end
$$;

-- Whether a row is on the table: Show (actions), the From/To days, every
-- search word somewhere in who / what / tenant / house / details, and the filters.
create function audit_matches(
  p_row audit_log,
  p_tenant_name text,
  p_actions text[],
  p_from date,
  p_to date,
  p_words text[],
  p_filters jsonb,
  p_logic text
)
returns boolean
language sql
stable
set search_path = public
as $$
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
$$;

-- One page of history: {rows, total (matching), all (the tenant's, or the
-- whole log's), page}. A page past the end returns the last one. Security
-- invoker: RLS (is_app_owner()) decides what the caller sees.
create function audit_history_page(
  p_tenant_id uuid default null,
  p_actions text[] default null,
  p_from date default null,
  p_to date default null,
  p_search text default null,
  p_filters jsonb default '[]'::jsonb,
  p_logic text default 'and',
  p_sort text default 'at',
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
$$;

revoke all on function audit_field(audit_log, text, text) from public, anon, authenticated;
revoke all on function audit_matches(audit_log, text, text[], date, date, text[], jsonb, text) from public, anon, authenticated;
revoke all on function audit_history_page(uuid, text[], date, date, text, jsonb, text, text, text, int, int)
  from public, anon, authenticated;

-- audit_history_page runs as the owner (security invoker), so the owner
-- needs the helpers it calls; they are pure and read nothing themselves.
grant execute on function audit_field(audit_log, text, text) to authenticated;
grant execute on function audit_matches(audit_log, text, text[], date, date, text[], jsonb, text) to authenticated;
grant execute on function audit_history_page(uuid, text[], date, date, text, jsonb, text, text, text, int, int)
  to authenticated;
