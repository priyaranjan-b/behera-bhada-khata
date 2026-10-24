-- Receipt numbers (D22 in docs/database-design.md).
--
-- Every payment gets a human receipt number, yyyy/MM/NNN (2026/10/001), and
-- every adjustment one of its own series, ADJ/yyyy/MM/NNN. The month is the
-- month it was recorded, in Asia/Kolkata (the app's time zone); the counter
-- restarts at 001 each month and is shared by all tenants. Numbers are taken
-- by create_payment / create_adjustment in the same transaction as the
-- insert, so a rejected write rolls its number back and the series has no
-- gaps. Once assigned a number never changes.

-- 1. The counters -----------------------------------------------------------

create table receipt_counters (
  series text not null check (series in ('payment', 'adjustment')),
  month date not null check (month = date_trunc('month', month)::date),
  last_no integer not null check (last_no > 0),
  primary key (series, month)
);

comment on table receipt_counters is
  'Last receipt number issued per series and month; written only by next_receipt_no().';

-- Nobody reads or writes it directly: next_receipt_no() is SECURITY DEFINER.
alter table receipt_counters enable row level security;
revoke all on receipt_counters from anon, authenticated;

-- Takes the next number of a series for the month `p_at` falls in. The
-- upsert's row lock serializes concurrent recordings in the same month.
create function next_receipt_no(p_series text, p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_at at time zone 'Asia/Kolkata')::date;
  v_no integer;
begin
  insert into receipt_counters (series, month, last_no)
  values (p_series, v_month, 1)
  on conflict (series, month) do update set last_no = receipt_counters.last_no + 1
  returning last_no into v_no;

  return case when p_series = 'adjustment' then 'ADJ/' else '' end
    || to_char(v_month, 'YYYY/MM') || '/'
    || lpad(v_no::text, greatest(3, length(v_no::text)), '0');
end;
$$;

revoke all on function next_receipt_no(text, timestamptz) from public, anon, authenticated, service_role;

-- 2. The columns, numbered for existing rows ---------------------------------

alter table payments add column receipt_no text unique;
alter table adjustments add column receipt_no text unique;

comment on column payments.receipt_no is
  'Receipt number yyyy/MM/NNN: month recorded (Asia/Kolkata), sequence across all tenants. Never changes.';
comment on column adjustments.receipt_no is
  'Adjustment number ADJ/yyyy/MM/NNN, its own series. Never changes.';

-- Existing rows, in the order they were recorded.
with numbered as (
  select id, date_trunc('month', created_at at time zone 'Asia/Kolkata')::date as month,
         row_number() over (
           partition by date_trunc('month', created_at at time zone 'Asia/Kolkata') order by created_at, id
         ) as n
  from payments
)
update payments p
set receipt_no = to_char(numbered.month, 'YYYY/MM') || '/' || lpad(n::text, greatest(3, length(n::text)), '0')
from numbered
where numbered.id = p.id;

with numbered as (
  select id, date_trunc('month', created_at at time zone 'Asia/Kolkata')::date as month,
         row_number() over (
           partition by date_trunc('month', created_at at time zone 'Asia/Kolkata') order by created_at, id
         ) as n
  from adjustments
)
update adjustments a
set receipt_no = 'ADJ/' || to_char(numbered.month, 'YYYY/MM') || '/' || lpad(n::text, greatest(3, length(n::text)), '0')
from numbered
where numbered.id = a.id;

insert into receipt_counters (series, month, last_no)
select 'payment', date_trunc('month', created_at at time zone 'Asia/Kolkata')::date, count(*)
from payments group by 2
union all
select 'adjustment', date_trunc('month', created_at at time zone 'Asia/Kolkata')::date, count(*)
from adjustments group by 2;

alter table payments alter column receipt_no set not null;
alter table adjustments alter column receipt_no set not null;

-- Printed on receipts: frozen like the place codes (prevent_key_change, 0006).
create trigger payments_receipt_no_frozen before update on payments
  for each row execute function prevent_key_change('receipt_no');
create trigger adjustments_receipt_no_frozen before update on adjustments
  for each row execute function prevent_key_change('receipt_no');

-- 3. create_payment / create_adjustment take the number ----------------------
-- Unchanged from 0010 except the insert's receipt_no; same signatures, so
-- the grants from 0010 stand.

create or replace function create_payment(
  p_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_mode text,
  p_note text,
  p_owner_signature_path text,
  p_token_hash text,
  p_token_expires_at timestamptz,
  p_allocations jsonb,
  p_proofs jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_distinct integer;
  v_total numeric(12, 2);
  v_proof_folder text := 'payments/' || p_tenant_id || '/' || p_id || '/proofs/';
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  if not exists (select 1 from tenants where id = p_tenant_id) then
    raise exception 'Tenant not found' using errcode = 'BBK04';
  end if;

  select count(*), count(distinct rent_period_id), coalesce(sum(amount), 0)
  into v_count, v_distinct, v_total
  from allocation_rows(p_allocations);

  if v_count = 0 then
    raise exception 'Select at least one month' using errcode = 'BBK00';
  end if;
  if v_distinct <> v_count then
    raise exception 'Each month can only appear once' using errcode = 'BBK00';
  end if;
  if exists (select 1 from allocation_rows(p_allocations) where amount is null or amount <= 0) then
    raise exception 'Each month''s amount must be more than zero' using errcode = 'BBK00';
  end if;
  if v_total <> round(p_amount, 2) then
    raise exception 'The months add up to %, not the payment amount %', v_total, round(p_amount, 2)
      using errcode = 'BBK00';
  end if;
  if exists (
    select 1 from allocation_rows(p_allocations) a
    left join rent_periods r on r.id = a.rent_period_id and r.tenant_id = p_tenant_id
    where r.id is null
  ) then
    raise exception 'A selected month doesn''t belong to this tenant' using errcode = 'BBK00';
  end if;

  -- Lock the months in a fixed order before checking what's still owed, so
  -- two payments recorded at once serialize instead of both fitting.
  perform 1 from rent_periods
  where id in (select rent_period_id from allocation_rows(p_allocations))
  order by id
  for update;

  if exists (
    select 1 from allocation_rows(p_allocations) a
    join rent_periods r on r.id = a.rent_period_id
    where a.amount > r.amount_due - r.amount_allocated
  ) then
    raise exception 'A month is allocated more than is still owed for it' using errcode = 'BBK00';
  end if;

  -- Proofs (0009). The app allows fewer; 10 is the hard ceiling.
  if jsonb_typeof(coalesce(p_proofs, '[]'::jsonb)) <> 'array' then
    raise exception 'Proofs must be a list' using errcode = 'BBK00';
  end if;
  if jsonb_array_length(coalesce(p_proofs, '[]'::jsonb)) > 10 then
    raise exception 'Attach at most 10 proof files' using errcode = 'BBK00';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_proofs, '[]'::jsonb)) f
    where f ->> 'storage_path' is null
       or left(f ->> 'storage_path', length(v_proof_folder)) <> v_proof_folder
       or length(f ->> 'storage_path') = length(v_proof_folder)
  ) then
    raise exception 'A proof file isn''t stored under this payment' using errcode = 'BBK00';
  end if;

  insert into payments (
    id, tenant_id, amount, payment_date, mode, note,
    owner_signature_path, token_hash, token_expires_at, status, confirmed_at, receipt_no
  ) values (
    p_id, p_tenant_id, round(p_amount, 2), p_payment_date, p_mode, p_note,
    p_owner_signature_path, p_token_hash, p_token_expires_at, 'confirmed', now(), next_receipt_no('payment', now())
  );

  insert into payment_allocations (payment_id, rent_period_id, amount_allocated)
  select p_id, rent_period_id, amount from allocation_rows(p_allocations);

  update rent_periods r
  set amount_allocated = r.amount_allocated + a.amount
  from allocation_rows(p_allocations) a
  where r.id = a.rent_period_id;

  insert into payment_proofs (payment_id, storage_path, file_name, content_type, size_bytes)
  select p_id, f ->> 'storage_path', f ->> 'file_name', f ->> 'content_type', (f ->> 'size_bytes')::integer
  from jsonb_array_elements(coalesce(p_proofs, '[]'::jsonb)) f;
end;
$$;

create or replace function create_adjustment(
  p_id uuid,
  p_original_payment_id uuid,
  p_delta_amount numeric,
  p_reason text,
  p_owner_signature_path text,
  p_token_hash text,
  p_token_expires_at timestamptz,
  p_allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_count integer;
  v_distinct integer;
  v_total numeric(12, 2);
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;

  select tenant_id into v_tenant_id
  from payments
  where id = p_original_payment_id and status = 'confirmed';
  if v_tenant_id is null then
    raise exception 'Payment not found' using errcode = 'BBK04';
  end if;

  select count(*), count(distinct rent_period_id), coalesce(sum(amount), 0)
  into v_count, v_distinct, v_total
  from allocation_rows(p_allocations);

  if v_count = 0 then
    raise exception 'Select at least one month' using errcode = 'BBK00';
  end if;
  if v_distinct <> v_count then
    raise exception 'Each month can only appear once' using errcode = 'BBK00';
  end if;
  if exists (select 1 from allocation_rows(p_allocations) where amount is null or amount = 0) then
    raise exception 'Each month''s change must not be zero' using errcode = 'BBK00';
  end if;
  if round(p_delta_amount, 2) = 0 or v_total <> round(p_delta_amount, 2) then
    raise exception 'The months add up to %, not the correction amount %', v_total, round(p_delta_amount, 2)
      using errcode = 'BBK00';
  end if;
  if exists (
    select 1 from allocation_rows(p_allocations) a
    left join payment_allocations pa
      on pa.payment_id = p_original_payment_id and pa.rent_period_id = a.rent_period_id
    where pa.id is null
  ) then
    raise exception 'A correction can only change months the original payment covered' using errcode = 'BBK00';
  end if;

  perform 1 from rent_periods
  where id in (select rent_period_id from allocation_rows(p_allocations))
  order by id
  for update;

  -- What this payment currently contributes to each month (its allocation
  -- plus earlier corrections) can't go below zero...
  if exists (
    select 1 from allocation_rows(p_allocations) a
    join payment_allocations pa
      on pa.payment_id = p_original_payment_id and pa.rent_period_id = a.rent_period_id
    where pa.amount_allocated + a.amount + coalesce((
      select sum(aa.amount_delta)
      from adjustment_allocations aa
      join adjustments adj on adj.id = aa.adjustment_id
      where adj.original_payment_id = p_original_payment_id
        and adj.status = 'confirmed'
        and aa.rent_period_id = a.rent_period_id
    ), 0) < 0
  ) then
    raise exception 'A correction can''t take back more than this payment put on a month' using errcode = 'BBK00';
  end if;
  -- ...and the month itself stays within [0, amount_due].
  if exists (
    select 1 from allocation_rows(p_allocations) a
    join rent_periods r on r.id = a.rent_period_id
    where r.amount_allocated + a.amount > r.amount_due or r.amount_allocated + a.amount < 0
  ) then
    raise exception 'A month would end up paid more than it is due' using errcode = 'BBK00';
  end if;

  insert into adjustments (
    id, tenant_id, original_payment_id, delta_amount, reason,
    owner_signature_path, token_hash, token_expires_at, status, confirmed_at, receipt_no
  ) values (
    p_id, v_tenant_id, p_original_payment_id, round(p_delta_amount, 2), p_reason,
    p_owner_signature_path, p_token_hash, p_token_expires_at, 'confirmed', now(), next_receipt_no('adjustment', now())
  );

  insert into adjustment_allocations (adjustment_id, rent_period_id, amount_delta)
  select p_id, rent_period_id, amount from allocation_rows(p_allocations);

  update rent_periods r
  set amount_allocated = r.amount_allocated + a.amount
  from allocation_rows(p_allocations) a
  where r.id = a.rent_period_id;
end;
$$;
