-- Ledger integrity: every multi-row or money-moving write happens inside one
-- Postgres function (one transaction), and the function - not the client -
-- checks the invariants:
--
--   * a payment's allocations sum to its amount, point at rent periods of
--     the same tenant, and never exceed what is still owed;
--   * an adjustment only touches periods its original payment allocated to,
--     its allocations sum to its delta, and it can't take back more than the
--     payment (plus earlier confirmed adjustments) put on that period;
--   * confirming moves rent_periods.amount_allocated atomically
--     (amount_allocated = amount_allocated + delta, rows locked), keeping it
--     within [0, amount_due].
--
-- Errors meant for the person using the app use SQLSTATE BBK00 (bad input,
-- surfaced as HTTP 400), BBK04 (not found, 404) or BBK09 (conflict, 409);
-- see mustWrite in src/server/adapters/supabase/clients.ts.

-- Belt-and-braces for the confirm functions below. NOT VALID so it applies to
-- new writes without failing on any pre-existing over-allocated rows.
alter table rent_periods
  add constraint rent_periods_allocated_within_due check (amount_allocated <= amount_due) not valid;

-- ---------------------------------------------------------------------------
-- Rent-period upkeep (service role only)
-- ---------------------------------------------------------------------------

-- Creates the missing rent_periods from each tenant's lease start up to and
-- including p_through (a first-of-month date), in one statement. p_tenant_ids
-- null means every active tenant (the daily cron).
create or replace function ensure_rent_periods(p_tenant_ids uuid[], p_through date)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted integer;
begin
  insert into rent_periods (tenant_id, period_month, amount_due)
  select t.id, m::date, t.monthly_rent_amount
  from tenants t
  cross join lateral generate_series(
    date_trunc('month', t.lease_start)::date,
    date_trunc('month', p_through)::date,
    interval '1 month'
  ) as m
  where (p_tenant_ids is null and t.status = 'active')
     or (p_tenant_ids is not null and t.id = any (p_tenant_ids))
  on conflict (tenant_id, period_month) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Creating pending ledger rows (called as the owner - RLS still applies)
-- ---------------------------------------------------------------------------

-- [{"rent_period_id": uuid, "amount": number}, ...] as rows, amounts rounded to cents.
create or replace function allocation_rows(p_allocations jsonb)
returns table (rent_period_id uuid, amount numeric(12, 2))
language sql
immutable
set search_path = public
as $$
  select (x ->> 'rent_period_id')::uuid, round((x ->> 'amount')::numeric, 2)
  from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) as x;
$$;

-- p_allocations: [{"rent_period_id": uuid, "amount": number}, ...]
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
  p_allocations jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
  v_distinct integer;
  v_total numeric(12, 2);
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
  if exists (
    select 1 from allocation_rows(p_allocations) a
    join rent_periods r on r.id = a.rent_period_id
    where a.amount > r.amount_due - r.amount_allocated
  ) then
    raise exception 'A month is allocated more than is still owed for it' using errcode = 'BBK00';
  end if;

  insert into payments (
    id, tenant_id, amount, payment_date, mode, note,
    owner_signature_path, token_hash, token_expires_at
  ) values (
    p_id, p_tenant_id, round(p_amount, 2), p_payment_date, p_mode, p_note,
    p_owner_signature_path, p_token_hash, p_token_expires_at
  );

  insert into payment_allocations (payment_id, rent_period_id, amount_allocated)
  select p_id, rent_period_id, amount from allocation_rows(p_allocations);
end;
$$;

-- p_allocations: [{"rent_period_id": uuid, "amount": number (signed)}, ...]
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
security invoker
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
  -- What this payment currently contributes to each month (its allocation
  -- plus earlier confirmed corrections) can't go below zero...
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
    owner_signature_path, token_hash, token_expires_at
  ) values (
    p_id, v_tenant_id, p_original_payment_id, round(p_delta_amount, 2), p_reason,
    p_owner_signature_path, p_token_hash, p_token_expires_at
  );

  insert into adjustment_allocations (adjustment_id, rent_period_id, amount_delta)
  select p_id, rent_period_id, amount from allocation_rows(p_allocations);
end;
$$;

-- ---------------------------------------------------------------------------
-- Confirming (service role only - the tenant's token flow)
-- ---------------------------------------------------------------------------

-- pending -> confirmed and apply the allocations, all or nothing. Returns
-- false if the payment was no longer pending (a racing confirmation won).
create or replace function confirm_payment(
  p_id uuid,
  p_tenant_signature_path text,
  p_pdf_path text,
  p_otp_verified_at timestamptz,
  p_confirmed_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update payments
  set status = 'confirmed',
      tenant_signature_path = p_tenant_signature_path,
      pdf_path = p_pdf_path,
      otp_verified_at = p_otp_verified_at,
      confirmed_at = p_confirmed_at
  where id = p_id and status = 'pending';
  if not found then
    return false;
  end if;

  -- Lock the affected months in a fixed order so concurrent confirmations
  -- serialize instead of deadlocking or losing an update.
  perform 1 from rent_periods
  where id in (select rent_period_id from payment_allocations where payment_id = p_id)
  order by id
  for update;

  if exists (
    select 1 from payment_allocations a
    join rent_periods r on r.id = a.rent_period_id
    where a.payment_id = p_id and r.amount_allocated + a.amount_allocated > r.amount_due
  ) then
    raise exception 'Another payment already covered some of these months. Ask the owner to record this payment again.'
      using errcode = 'BBK09';
  end if;

  update rent_periods r
  set amount_allocated = r.amount_allocated + a.amount_allocated
  from payment_allocations a
  where a.payment_id = p_id and r.id = a.rent_period_id;

  return true;
end;
$$;

create or replace function confirm_adjustment(
  p_id uuid,
  p_tenant_signature_path text,
  p_pdf_path text,
  p_otp_verified_at timestamptz,
  p_confirmed_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update adjustments
  set status = 'confirmed',
      tenant_signature_path = p_tenant_signature_path,
      pdf_path = p_pdf_path,
      otp_verified_at = p_otp_verified_at,
      confirmed_at = p_confirmed_at
  where id = p_id and status = 'pending';
  if not found then
    return false;
  end if;

  perform 1 from rent_periods
  where id in (select rent_period_id from adjustment_allocations where adjustment_id = p_id)
  order by id
  for update;

  if exists (
    select 1 from adjustment_allocations a
    join rent_periods r on r.id = a.rent_period_id
    where a.adjustment_id = p_id
      and (r.amount_allocated + a.amount_delta > r.amount_due or r.amount_allocated + a.amount_delta < 0)
  ) then
    raise exception 'The months this correction changes have moved on since it was recorded. Ask the owner to record it again.'
      using errcode = 'BBK09';
  end if;

  update rent_periods r
  set amount_allocated = r.amount_allocated + a.amount_delta
  from adjustment_allocations a
  where a.adjustment_id = p_id and r.id = a.rent_period_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting for the public endpoints that send SMS/email
-- ---------------------------------------------------------------------------

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

create index rate_limits_window_start_idx on rate_limits (window_start);

alter table rate_limits enable row level security;
-- No policies: only the service role (which bypasses RLS) touches this table.
revoke all on rate_limits from anon, authenticated;

-- Fixed-window counter: records one hit for p_key and returns whether it is
-- still within p_limit hits per p_window_seconds.
create or replace function hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
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
$$;

create or replace function prune_rate_limits()
returns integer
language sql
security invoker
set search_path = public
as $$
  with deleted as (
    delete from rate_limits where window_start < now() - interval '1 day' returning 1
  )
  select count(*)::integer from deleted;
$$;

-- ---------------------------------------------------------------------------
-- Function grants. Supabase grants EXECUTE on new public functions to anon
-- and authenticated by default, so revoke first and grant back narrowly.
-- ---------------------------------------------------------------------------

revoke all on function allocation_rows(jsonb) from public, anon, authenticated;
revoke all on function ensure_rent_periods(uuid[], date) from public, anon, authenticated;
revoke all on function create_payment(uuid, uuid, numeric, date, text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function create_adjustment(uuid, uuid, numeric, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function confirm_payment(uuid, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function confirm_adjustment(uuid, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function hit_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function prune_rate_limits() from public, anon, authenticated;

grant execute on function allocation_rows(jsonb) to authenticated, service_role;
grant execute on function create_payment(uuid, uuid, numeric, date, text, text, text, text, timestamptz, jsonb)
  to authenticated;
grant execute on function create_adjustment(uuid, uuid, numeric, text, text, text, timestamptz, jsonb)
  to authenticated;

grant execute on function ensure_rent_periods(uuid[], date) to service_role;
grant execute on function confirm_payment(uuid, text, text, timestamptz, timestamptz) to service_role;
grant execute on function confirm_adjustment(uuid, text, text, timestamptz, timestamptz) to service_role;
grant execute on function hit_rate_limit(text, integer, integer) to service_role;
grant execute on function prune_rate_limits() to service_role;
