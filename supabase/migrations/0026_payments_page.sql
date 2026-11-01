-- The Payments page: every recorded payment from every tenant, by the day it
-- was received, one page at a time (A15, D28), with the money per mode for
-- the stat cards (A18 in docs/design-decisions.md).
--
-- A row is one confirmed payment dated in the chosen days (payment_date, not
-- the rent month it paid). Adjustments stay on the tenant's ledger. The
-- totals cover every row that passes the search and filters, whatever the
-- page, so the cards always describe what the table finds. Government rent
-- paid direct (A11) has no date received and is not a row; the app counts
-- it on its own card.

create index payments_payment_date_idx on payments (payment_date);

-- Matches paymentModeLabel / PAYMENT_MODE_LABELS (src/lib/domain/payments.ts);
-- test/schema.test.ts keeps them equal.
create function payment_mode_label(p_mode text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_mode
    when 'cash' then 'Cash'
    when 'bank_transfer' then 'Bank transfer'
    when 'upi' then 'UPI'
    when 'cheque' then 'Cheque'
    else 'Other'
  end
$$;

-- Every payment received from p_from to p_to (both included).
create function payments_rows(p_from date, p_to date)
returns table (
  id uuid, receipt_no text, payment_date date, date_label text, tenant_id uuid, tenant_name text,
  property_name text, mode text, mode_label text, amount numeric, months_text text, note text, acknowledged boolean
)
language sql
stable
set search_path = public
as $$
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
$$;

-- The rows that pass the search and the filters.
create function payments_matching(p_from date, p_to date, p_words text[], p_filters jsonb, p_logic text)
returns table (
  id uuid, receipt_no text, payment_date date, date_label text, tenant_id uuid, tenant_name text,
  property_name text, mode text, mode_label text, amount numeric, months_text text, note text, acknowledged boolean
)
language sql
stable
set search_path = public
as $$
  select r.* from payments_rows(p_from, p_to) r
  where grid_row_matches(
    jsonb_build_object(
      'date', r.date_label, 'receipt', coalesce(r.receipt_no, ''), 'tenant', r.tenant_name || E'\n' || r.property_name,
      'mode', r.mode_label, 'months', r.months_text, 'note', r.note
    ),
    concat_ws(E'\n', r.date_label, r.receipt_no, r.tenant_name, r.property_name, r.mode_label, r.months_text, r.note),
    p_words, p_filters, p_logic
  )
$$;

-- {rows, total, all, page, totals: {amount, count, by_mode: {cash, upi, ...}}}.
-- At most 731 days, so one query never reads years of payments.
-- Security invoker: RLS (is_app_owner()) decides what the caller sees.
create function payments_page(
  p_from date,
  p_to date,
  p_search text default null,
  p_filters jsonb default '[]'::jsonb,
  p_logic text default 'and',
  p_sort text default 'payment_date',
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
$$;

revoke all on function payment_mode_label(text) from public, anon, authenticated;
revoke all on function payments_rows(date, date) from public, anon, authenticated;
revoke all on function payments_matching(date, date, text[], jsonb, text) from public, anon, authenticated;
revoke all on function payments_page(date, date, text, jsonb, text, text, text, int, int) from public, anon, authenticated;

-- These run as the owner (security invoker), so the owner needs the helpers
-- they call; they read nothing RLS doesn't already allow.
grant execute on function payment_mode_label(text) to authenticated;
grant execute on function payments_rows(date, date) to authenticated;
grant execute on function payments_matching(date, date, text[], jsonb, text) to authenticated;
grant execute on function payments_page(date, date, text, jsonb, text, text, text, int, int) to authenticated;
