-- Payments and adjustments count the moment the owner records them (D20 in
-- docs/database-design.md).
--
-- Until now a payment stayed 'pending' - not moving any balance - until the
-- tenant signed and verified an OTP. Now create_payment / create_adjustment
-- record the row as 'confirmed' and apply its allocations to rent_periods in
-- the same transaction. The tenant's signature + OTP becomes an optional
-- acknowledgement (acknowledged_at), recorded by acknowledge_payment /
-- acknowledge_adjustment; it never moves money.
--
-- Because recording now moves money, only those two functions may write the
-- ledger: they are SECURITY DEFINER with the is_app_owner() check, and the
-- owner role loses direct INSERT on every ledger table.

-- 1. Tenant acknowledgement ------------------------------------------------

alter table payments add column acknowledged_at timestamptz;
alter table adjustments add column acknowledged_at timestamptz;

comment on column payments.acknowledged_at is
  'When the tenant signed and verified an OTP for this payment (optional; never affects balances).';
comment on column adjustments.acknowledged_at is
  'When the tenant signed and verified an OTP for this adjustment (optional; never affects balances).';

-- Records the tenant already signed were acknowledged when they confirmed.
update payments set acknowledged_at = confirmed_at where tenant_signature_path is not null;
update adjustments set acknowledged_at = confirmed_at where tenant_signature_path is not null;

alter table payments alter column status set default 'confirmed';
alter table adjustments alter column status set default 'confirmed';

-- 2. Confirm what was still waiting for the tenant -------------------------
-- Same checks and locking as the old confirm_* functions, oldest first. If a
-- month would end up over-allocated the whole migration fails, so nothing is
-- applied half-way.

do $$
declare
  r record;
begin
  for r in select id from payments where status = 'pending' order by created_at, id loop
    perform 1 from rent_periods
    where id in (select rent_period_id from payment_allocations where payment_id = r.id)
    order by id
    for update;

    if exists (
      select 1 from payment_allocations a
      join rent_periods p on p.id = a.rent_period_id
      where a.payment_id = r.id and p.amount_allocated + a.amount_allocated > p.amount_due
    ) then
      raise exception 'Pending payment % would over-allocate a month; resolve it before migrating', r.id;
    end if;

    update rent_periods p
    set amount_allocated = p.amount_allocated + a.amount_allocated
    from payment_allocations a
    where a.payment_id = r.id and p.id = a.rent_period_id;

    update payments set status = 'confirmed', confirmed_at = now() where id = r.id;
  end loop;

  for r in select id from adjustments where status = 'pending' order by created_at, id loop
    perform 1 from rent_periods
    where id in (select rent_period_id from adjustment_allocations where adjustment_id = r.id)
    order by id
    for update;

    if exists (
      select 1 from adjustment_allocations a
      join rent_periods p on p.id = a.rent_period_id
      where a.adjustment_id = r.id
        and (p.amount_allocated + a.amount_delta > p.amount_due or p.amount_allocated + a.amount_delta < 0)
    ) then
      raise exception 'Pending adjustment % would push a month out of range; resolve it before migrating', r.id;
    end if;

    update rent_periods p
    set amount_allocated = p.amount_allocated + a.amount_delta
    from adjustment_allocations a
    where a.adjustment_id = r.id and p.id = a.rent_period_id;

    update adjustments set status = 'confirmed', confirmed_at = now() where id = r.id;
  end loop;
end;
$$;

-- 3. Only the functions write the ledger ------------------------------------

drop policy "owner creates pending payments" on payments;
drop policy "owner allocates pending payments" on payment_allocations;
drop policy "owner creates pending adjustments" on adjustments;
drop policy "owner allocates pending adjustments" on adjustment_allocations;
drop policy "owner attaches proofs to pending payments" on payment_proofs;

revoke insert on payments, payment_allocations, payment_proofs, adjustments, adjustment_allocations
  from authenticated;

-- Resending the link is allowed until the tenant acknowledges (the column
-- grant from 0001 still limits UPDATE to token_hash / token_expires_at).
drop policy "owner rotates share link on pending payments" on payments;
create policy "owner rotates share link until acknowledged" on payments
  for update to authenticated
  using (is_app_owner() and acknowledged_at is null) with check (is_app_owner() and acknowledged_at is null);

drop policy "owner rotates share link on pending adjustments" on adjustments;
create policy "owner rotates share link until acknowledged" on adjustments
  for update to authenticated
  using (is_app_owner() and acknowledged_at is null) with check (is_app_owner() and acknowledged_at is null);

-- 4. create_payment: record and apply in one transaction ---------------------

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
    owner_signature_path, token_hash, token_expires_at, status, confirmed_at
  ) values (
    p_id, p_tenant_id, round(p_amount, 2), p_payment_date, p_mode, p_note,
    p_owner_signature_path, p_token_hash, p_token_expires_at, 'confirmed', now()
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

-- 5. create_adjustment: correct and apply in one transaction -----------------

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
    owner_signature_path, token_hash, token_expires_at, status, confirmed_at
  ) values (
    p_id, v_tenant_id, p_original_payment_id, round(p_delta_amount, 2), p_reason,
    p_owner_signature_path, p_token_hash, p_token_expires_at, 'confirmed', now()
  );

  insert into adjustment_allocations (adjustment_id, rent_period_id, amount_delta)
  select p_id, rent_period_id, amount from allocation_rows(p_allocations);

  update rent_periods r
  set amount_allocated = r.amount_allocated + a.amount
  from allocation_rows(p_allocations) a
  where r.id = a.rent_period_id;
end;
$$;

-- 6. Tenant acknowledgement replaces confirmation ----------------------------
-- The old confirm_* applied allocations; with every row already confirmed
-- they must not exist any more.

drop function confirm_payment(uuid, text, text, timestamptz, timestamptz);
drop function confirm_adjustment(uuid, text, text, timestamptz, timestamptz);

create function acknowledge_payment(
  p_id uuid,
  p_tenant_signature_path text,
  p_pdf_path text,
  p_otp_verified_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Compare-and-swap: a second (racing or replayed) acknowledgement changes nothing.
  update payments
  set tenant_signature_path = p_tenant_signature_path,
      pdf_path = p_pdf_path,
      otp_verified_at = p_otp_verified_at,
      acknowledged_at = now()
  where id = p_id and acknowledged_at is null;
  return found;
end;
$$;

create function acknowledge_adjustment(
  p_id uuid,
  p_tenant_signature_path text,
  p_pdf_path text,
  p_otp_verified_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  update adjustments
  set tenant_signature_path = p_tenant_signature_path,
      pdf_path = p_pdf_path,
      otp_verified_at = p_otp_verified_at,
      acknowledged_at = now()
  where id = p_id and acknowledged_at is null;
  return found;
end;
$$;

-- 7. Grants -----------------------------------------------------------------

revoke all on function create_payment(uuid, uuid, numeric, date, text, text, text, text, timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function create_payment(uuid, uuid, numeric, date, text, text, text, text, timestamptz, jsonb, jsonb)
  to authenticated;
revoke all on function create_adjustment(uuid, uuid, numeric, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function create_adjustment(uuid, uuid, numeric, text, text, text, timestamptz, jsonb)
  to authenticated;

revoke all on function acknowledge_payment(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function acknowledge_adjustment(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function acknowledge_payment(uuid, text, text, timestamptz) to service_role;
grant execute on function acknowledge_adjustment(uuid, text, text, timestamptz) to service_role;
