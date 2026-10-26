-- The Billing page's months, one page at a time, and its totals (A15, D28).
--
-- A Billing row is one tenant's rent for one month in the chosen range
-- (up to 24 months), so the table grows with tenants × months. It now pages,
-- sorts, searches and filters in SQL. This keeps getBillingReport's rules
-- (src/server/services/billing.ts):
--   * every stored rent month in the range, whoever it belongs to;
--   * when shown, government rent paid to the owner directly (A11), computed
--     and never stored: for each untracked, non-draft tenant, each month from
--     the lease month to the move-out month and no later than two months
--     ahead, at the agreement rent in effect (before the first rate, the
--     first rate) - paidDirectMonths in src/lib/domain/billing.ts;
--   * the tower and houses a tenant holds today, or held last once moved
--     out - placementOf / currentTenancies in src/server/services/placements.ts;
--   * "Paid by": the confirmed payments allocated to the month, oldest first.
-- The totals (billed, collected, balance, overdue, rate, tenants) cover the
-- whole range, whatever the page, "Show" or search.

create index rent_periods_period_month_idx on rent_periods (period_month);

-- The houses a tenant holds today (Asia/Kolkata), or held last once moved
-- out: their codes and the names of their towers.
create function tenant_placement_now(p_tenant_id uuid, out property_name text, out unit_codes text[])
language sql
stable
set search_path = public
as $$
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
$$;

-- Every Billing row of the range: stored rent months, plus paid-direct months
-- when p_paid_direct.
create function billing_rows(p_from date, p_to date, p_paid_direct boolean)
returns table (
  id text, tenant_id uuid, tenant_name text, property_name text, unit_codes text[],
  period_month date, month_label text, amount_due numeric, amount_allocated numeric, balance numeric,
  status text, not_yet_due boolean, paid_direct boolean, display_status text, status_label text, status_rank int,
  payments jsonb, receipt_text text
)
language sql
stable
set search_path = public
as $$
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
$$;

-- The rows that pass "Show", the search and the filters.
create function billing_matching(
  p_from date, p_to date, p_paid_direct boolean, p_show text, p_words text[], p_filters jsonb, p_logic text
)
returns table (
  id text, tenant_id uuid, tenant_name text, property_name text, unit_codes text[],
  period_month date, month_label text, amount_due numeric, amount_allocated numeric, balance numeric,
  status text, not_yet_due boolean, paid_direct boolean, display_status text, status_label text, status_rank int,
  payments jsonb, receipt_text text
)
language sql
stable
set search_path = public
as $$
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
$$;

-- {rows, total, all, page}; a row is the Billing row above. Show: all |
-- unpaid | partly | paid (incl. paid direct) | paidDirect | notDue.
-- Security invoker: RLS (is_app_owner()) decides what the caller sees.
create function billing_page(
  p_from date,
  p_to date,
  p_paid_direct boolean default true,
  p_show text default 'all',
  p_search text default null,
  p_filters jsonb default '[]'::jsonb,
  p_logic text default 'and',
  p_sort text default 'amount_allocated',
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
$$;

-- The range's totals for the stat cards: billingTotals in src/lib/domain/billing.ts.
create function billing_totals(p_from date, p_to date, p_paid_direct boolean default true)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
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
$$;

revoke all on function tenant_placement_now(uuid) from public, anon, authenticated;
revoke all on function billing_rows(date, date, boolean) from public, anon, authenticated;
revoke all on function billing_matching(date, date, boolean, text, text[], jsonb, text) from public, anon, authenticated;
revoke all on function billing_page(date, date, boolean, text, text, jsonb, text, text, text, int, int) from public, anon, authenticated;
revoke all on function billing_totals(date, date, boolean) from public, anon, authenticated;

-- These run as the owner (security invoker), so the owner needs the helpers
-- they call; they read nothing RLS doesn't already allow.
grant execute on function tenant_placement_now(uuid) to authenticated;
grant execute on function billing_rows(date, date, boolean) to authenticated;
grant execute on function billing_matching(date, date, boolean, text, text[], jsonb, text) to authenticated;
grant execute on function billing_page(date, date, boolean, text, text, jsonb, text, text, text, int, int) to authenticated;
grant execute on function billing_totals(date, date, boolean) to authenticated;
