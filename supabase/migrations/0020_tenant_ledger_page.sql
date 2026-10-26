-- A tenant's ledger, one page at a time (A15, D28).
--
-- The tenant page's Ledger merges rent charges, payments and adjustments into
-- one journal with a running balance. It grows by a few rows every month, so
-- it now pages, sorts, searches and filters in SQL. This replaces
-- buildTenantLedger (src/lib/domain/tenantLedger.ts) and keeps its rules:
--   * charge: one per rent month, dated the month, debit = amount due;
--     "upcoming" (shown, not counted) for this month and later, else "billed";
--   * payment: dated payment_date, credit = amount;
--   * adjustment: dated the Asia/Kolkata day it was confirmed (else created),
--     a negative delta is a debit, a positive one a credit;
--   * the running balance walks the journal by date, then type (adjustment,
--     charge, payment), then when it was recorded, then id, and skips pending
--     and upcoming rows. It is computed over the tenant's whole ledger before
--     any filter or page, so every page shows the all-time balance.

-- Every ledger row of the tenant, in journal order (ord), with its balance.
create function tenant_ledger_rows(p_tenant_id uuid)
returns table (
  id text, type text, date date, description text, caption text,
  debit numeric, credit numeric, balance numeric, status text, status_label text, date_label text,
  ref_id uuid, receipt_no text, acknowledged boolean, ord bigint
)
language sql
stable
set search_path = public
as $$
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
$$;

-- The rows that pass the dates, the search and the filters.
create function tenant_ledger_matching(
  p_tenant_id uuid, p_from date, p_to date, p_words text[], p_filters jsonb, p_logic text
)
returns table (
  id text, type text, date date, description text, caption text,
  debit numeric, credit numeric, balance numeric, status text, status_label text, date_label text,
  ref_id uuid, receipt_no text, acknowledged boolean, ord bigint
)
language sql
stable
set search_path = public
as $$
  select l.* from tenant_ledger_rows(p_tenant_id) l
  where (p_from is null or l.date >= p_from)
    and (p_to is null or l.date <= p_to)
    and grid_row_matches(
      jsonb_build_object('date', l.date_label, 'description', l.description || E'\n' || l.caption, 'status', l.status_label),
      concat_ws(E'\n', l.date_label, l.description, l.caption, l.status_label),
      p_words, p_filters, p_logic
    )
$$;

-- {rows, total, all, page}; a row is the ledger row above (without ord).
-- Dates: an inclusive day range ("Month" is sent as its first and last day).
-- Security invoker: RLS (is_app_owner()) decides what the caller sees.
create function tenant_ledger_page(
  p_tenant_id uuid,
  p_from date default null,
  p_to date default null,
  p_search text default null,
  p_filters jsonb default '[]'::jsonb,
  p_logic text default 'and',
  p_sort text default 'date',
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
$$;

revoke all on function tenant_ledger_rows(uuid) from public, anon, authenticated;
revoke all on function tenant_ledger_matching(uuid, date, date, text[], jsonb, text) from public, anon, authenticated;
revoke all on function tenant_ledger_page(uuid, date, date, text, jsonb, text, text, text, int, int) from public, anon, authenticated;

-- tenant_ledger_page runs as the owner (security invoker), so the owner needs
-- the helpers it calls; they read nothing RLS doesn't already allow.
grant execute on function tenant_ledger_rows(uuid) to authenticated;
grant execute on function tenant_ledger_matching(uuid, date, date, text[], jsonb, text) to authenticated;
grant execute on function tenant_ledger_page(uuid, date, date, text, jsonb, text, text, text, int, int) to authenticated;
grant execute on function audit_date(date) to authenticated;
grant execute on function audit_short_month(date) to authenticated;
