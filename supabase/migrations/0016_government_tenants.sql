-- Government tenants whose rent isn't collected here (D26 in
-- docs/database-design.md).
--
-- Some occupants are government institutes that pay rent straight into the
-- owner's bank account under their agreement. The owner keeps them in the app
-- for their houses, but doesn't want rent months, dues or Defaulters for them
-- until they choose to track that rent.
--
--   * tenants.tenant_kind: individual | business | government. A government
--     tenant may have no phone.
--   * tenants.rent_tracked: false only for a government tenant. An untracked
--     tenant is active, holds its houses, has billing_start = null and so no
--     rent months. Its rent (the agreement rent) is optional.
--   * start_rent_tracking: sets billing_start from "rent paid up to" and
--     starts billing, after which it is a normal tenant.
--   * stop_rent_tracking: undoes that while no payment or adjustment is
--     recorded; after one, tracking is one-way.

-- ---------------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------------

alter table tenants
  add column tenant_kind text not null default 'individual'
    constraint tenants_kind_valid check (tenant_kind in ('individual', 'business', 'government')),
  add column rent_tracked boolean not null default true;

update tenants set tenant_kind = 'business' where business_name is not null;

alter table tenants
  add constraint tenants_untracked_is_government check (rent_tracked or tenant_kind = 'government'),
  drop constraint tenants_active_has_phone,
  add constraint tenants_active_has_phone
    check (status <> 'active' or phone is not null or tenant_kind = 'government'),
  drop constraint tenants_active_has_billing_start,
  add constraint tenants_active_has_billing_start
    check (status <> 'active' or billing_start is not null or not rent_tracked);

comment on column tenants.tenant_kind is
  'individual | business | government. A government tenant needs no phone and may have its rent untracked.';
comment on column tenants.rent_tracked is
  'false: rent is paid to the owner directly (government agreement) and not tracked here - no rent months, no dues. Changed only by start_rent_tracking / stop_rent_tracking.';

-- ---------------------------------------------------------------------------
-- ensure_rent_periods: never for an untracked tenant
-- ---------------------------------------------------------------------------

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
  select t.id, m.month, rent_for_month(t.id, m.month)
  from tenants t
  cross join lateral (
    select gs::date as month
    from generate_series(
      t.billing_start,
      least(
        date_trunc('month', p_through)::date,
        coalesce(date_trunc('month', t.moved_out_on)::date, date_trunc('month', p_through)::date)
      ),
      interval '1 month'
    ) as gs
  ) as m
  where t.status <> 'draft'
    and t.rent_tracked
    and t.billing_start is not null
    and ((p_tenant_ids is null and t.status = 'active') or (p_tenant_ids is not null and t.id = any (p_tenant_ids)))
    and rent_for_month(t.id, m.month) is not null
  on conflict (tenant_id, period_month) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_tenant: p_tenant_kind, p_rent_tracked
-- ---------------------------------------------------------------------------

drop function create_tenant(text, text, text, text, numeric, date, text[], date, numeric);

-- As in 0008. A government tenant may have no phone, and with
-- p_rent_tracked = false it isn't billed: billing_start stays null, rent is
-- optional (written from the lease month when given) and p_paid_through is
-- ignored.
create function create_tenant(
  p_name text,
  p_business_name text,
  p_phone text,
  p_preferred_channel text,
  p_monthly_rent numeric,
  p_lease_start date,
  p_unit_codes text[],
  p_paid_through date default null,
  p_deposit_amount numeric default null,
  p_tenant_kind text default 'individual',
  p_rent_tracked boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_kind text := coalesce(p_tenant_kind, 'individual');
  v_tracked boolean := coalesce(p_rent_tracked, true);
  v_billing_start date;
  v_rate_month date;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  if not v_tracked and v_kind <> 'government' then
    raise exception 'Only a government tenant''s rent can be left untracked' using errcode = 'BBK00';
  end if;
  if v_kind <> 'government' and nullif(btrim(p_phone), '') is null then
    raise exception 'Phone is required' using errcode = 'BBK00';
  end if;
  if v_tracked and p_monthly_rent is null then
    raise exception 'Monthly rent must be more than zero' using errcode = 'BBK00';
  end if;
  if p_monthly_rent is not null and p_monthly_rent <= 0 then
    raise exception 'Monthly rent must be more than zero' using errcode = 'BBK00';
  end if;
  perform assert_units_available(p_unit_codes, p_lease_start);

  if v_tracked then
    v_billing_start := billing_start_for(p_lease_start, p_paid_through);
  end if;
  v_rate_month := coalesce(v_billing_start, date_trunc('month', p_lease_start)::date);

  insert into tenants (
    name, business_name, phone, preferred_channel, lease_start, billing_start, deposit_amount, tenant_kind, rent_tracked
  )
  values (
    p_name, nullif(btrim(p_business_name), ''), nullif(btrim(p_phone), ''), p_preferred_channel, p_lease_start,
    v_billing_start, round(p_deposit_amount, 2), v_kind, v_tracked
  )
  returning id into v_id;

  if p_monthly_rent is not null then
    insert into tenant_rent_rates (tenant_id, effective_month, monthly_amount)
    values (v_id, v_rate_month, round(p_monthly_rent, 2));
  end if;

  -- Tenancies are history: they start when the tenant moved in.
  insert into tenant_units (tenant_id, unit_code, start_date)
  select v_id, c, p_lease_start from unnest(p_unit_codes) as c;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_tenant: p_tenant_kind, p_rent_tracked
-- ---------------------------------------------------------------------------

drop function update_tenant(uuid, text, text, text, text, text[], date, numeric, date, date, date, numeric);

-- As in 0008, plus:
--   * p_tenant_kind (null = keep). An untracked tenant must stay government.
--   * Phone is optional for a government tenant.
--   * p_rent_tracked applies only when completing a draft (null = tracked).
--     An untracked government draft becomes active with just a lease start:
--     no billing_start, and the rent, if given, is the agreement rent from the
--     lease month. Afterwards only start_rent_tracking / stop_rent_tracking
--     change it.
create function update_tenant(
  p_tenant_id uuid,
  p_name text,
  p_business_name text,
  p_phone text,
  p_preferred_channel text,
  p_unit_codes text[],
  p_units_effective date,
  p_monthly_rent numeric,
  p_rent_effective_month date,
  p_lease_start date,
  p_paid_through date default null,
  p_deposit_amount numeric default null,
  p_tenant_kind text default null,
  p_rent_tracked boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_kind text;
  v_tracked boolean;
  v_current text[];
  v_removed text[];
  v_added text[];
  v_bad record;
  v_month date;
  v_billing_start date;
  v_has_phone boolean := nullif(btrim(p_phone), '') is not null;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  select status, tenant_kind, rent_tracked into v_status, v_kind, v_tracked
  from tenants where id = p_tenant_id for update;
  if v_status is null then
    raise exception 'Tenant not found' using errcode = 'BBK04';
  end if;
  v_kind := coalesce(p_tenant_kind, v_kind);

  if v_kind <> 'government' and not v_tracked then
    raise exception 'Start tracking this tenant''s rent before changing its type' using errcode = 'BBK09';
  end if;
  if v_status <> 'draft' and v_kind <> 'government' and not v_has_phone then
    raise exception 'Phone is required' using errcode = 'BBK00';
  end if;

  if v_status = 'draft' then
    update tenants set deposit_amount = round(p_deposit_amount, 2) where id = p_tenant_id;
  elsif p_deposit_amount is not null
    and round(p_deposit_amount, 2) is distinct from (select deposit_amount from tenants where id = p_tenant_id) then
    raise exception 'The deposit can''t be changed once the tenant is active' using errcode = 'BBK09';
  end if;

  update tenants
  set name = p_name,
      business_name = nullif(btrim(p_business_name), ''),
      phone = nullif(btrim(p_phone), ''),
      preferred_channel = p_preferred_channel,
      tenant_kind = v_kind
  where id = p_tenant_id;

  -- ---- Draft: replace the provisional house set, activate when complete ----
  if v_status = 'draft' then
    v_tracked := coalesce(p_rent_tracked, true);
    if not v_tracked and v_kind <> 'government' then
      raise exception 'Only a government tenant''s rent can be left untracked' using errcode = 'BBK00';
    end if;

    if p_unit_codes is not null then
      if cardinality(p_unit_codes) = 0 then
        raise exception 'A tenant must keep at least one house' using errcode = 'BBK00';
      end if;
      delete from tenant_units where tenant_id = p_tenant_id;
      perform assert_units_available(p_unit_codes, coalesce(p_lease_start, current_date));
      insert into tenant_units (tenant_id, unit_code, start_date)
      select p_tenant_id, c, coalesce(p_lease_start, current_date) from unnest(p_unit_codes) as c;
    end if;

    if p_monthly_rent is not null and p_monthly_rent <= 0 then
      raise exception 'Monthly rent must be more than zero' using errcode = 'BBK00';
    end if;

    if p_lease_start is not null
      and (not v_tracked or ((v_has_phone or v_kind = 'government') and p_monthly_rent is not null)) then
      if p_unit_codes is null then
        begin
          update tenant_units set start_date = p_lease_start where tenant_id = p_tenant_id and end_date is null;
        exception when exclusion_violation then
          raise exception 'A house was still occupied by someone else on %', p_lease_start using errcode = 'BBK09';
        end;
      end if;
      if v_tracked then
        v_billing_start := billing_start_for(
          p_lease_start,
          coalesce(p_paid_through, (date_trunc('month', current_date) - interval '1 month')::date)
        );
      end if;
      update tenants
      set status = 'active', lease_start = p_lease_start, billing_start = v_billing_start, rent_tracked = v_tracked
      where id = p_tenant_id;
      if p_monthly_rent is not null then
        insert into tenant_rent_rates (tenant_id, effective_month, monthly_amount)
        values (p_tenant_id, coalesce(v_billing_start, date_trunc('month', p_lease_start)::date), round(p_monthly_rent, 2))
        on conflict (tenant_id, effective_month) do update set monthly_amount = excluded.monthly_amount;
      end if;
    elsif p_monthly_rent is not null or p_lease_start is not null then
      if v_kind = 'government' then
        raise exception 'To start billing, enter the monthly rent and lease start together' using errcode = 'BBK00';
      end if;
      raise exception 'To start billing, enter the phone, monthly rent and lease start together'
        using errcode = 'BBK00';
    end if;
    return;
  end if;

  -- ---- Active / moved out: unchanged from 0008 ----
  if p_unit_codes is not null then
    select coalesce(array_agg(unit_code order by unit_code), '{}') into v_current
    from tenant_units where tenant_id = p_tenant_id and end_date is null;

    select coalesce(array_agg(c), '{}') into v_removed from unnest(v_current) as c where c <> all (p_unit_codes);
    select coalesce(array_agg(c), '{}') into v_added from unnest(p_unit_codes) as c where c <> all (v_current);

    if cardinality(v_removed) > 0 or cardinality(v_added) > 0 then
      if v_status <> 'active' then
        raise exception 'This tenant has moved out' using errcode = 'BBK09';
      end if;
      if cardinality(p_unit_codes) = 0 then
        raise exception 'A tenant must keep at least one house (use Move out instead)' using errcode = 'BBK00';
      end if;
      if p_units_effective is null then
        raise exception 'Choose the date the houses change' using errcode = 'BBK00';
      end if;

      select unit_code, start_date into v_bad
      from tenant_units
      where tenant_id = p_tenant_id and end_date is null and unit_code = any (v_removed)
        and start_date >= p_units_effective
      limit 1;
      if found then
        raise exception 'The change date must be after % moved in (%)', v_bad.unit_code, v_bad.start_date
          using errcode = 'BBK00';
      end if;

      if cardinality(v_added) > 0 then
        perform assert_units_available(v_added, p_units_effective);
      end if;

      update tenant_units
      set end_date = p_units_effective - 1
      where tenant_id = p_tenant_id and end_date is null and unit_code = any (v_removed);

      insert into tenant_units (tenant_id, unit_code, start_date)
      select p_tenant_id, c, p_units_effective from unnest(v_added) as c;
    end if;
  end if;

  if p_monthly_rent is not null then
    if p_monthly_rent <= 0 then
      raise exception 'Monthly rent must be more than zero' using errcode = 'BBK00';
    end if;
    v_month := date_trunc('month', coalesce(p_rent_effective_month, current_date))::date;
    if rent_for_month(p_tenant_id, v_month) is distinct from round(p_monthly_rent, 2) then
      if v_status <> 'active' then
        raise exception 'This tenant has moved out' using errcode = 'BBK09';
      end if;
      if has_allocations_from(p_tenant_id, v_month) then
        raise exception 'A payment is already recorded for % or later. Pick a later month, or record an adjustment.',
          to_char(v_month, 'Mon YYYY')
          using errcode = 'BBK09';
      end if;

      insert into tenant_rent_rates (tenant_id, effective_month, monthly_amount)
      values (p_tenant_id, v_month, round(p_monthly_rent, 2))
      on conflict (tenant_id, effective_month) do update set monthly_amount = excluded.monthly_amount;

      update rent_periods r
      set amount_due = rent_for_month(p_tenant_id, r.period_month)
      where r.tenant_id = p_tenant_id and r.period_month >= v_month;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_rent_tracking / stop_rent_tracking
-- ---------------------------------------------------------------------------

-- Starts billing an untracked government tenant: billing_start is the month
-- after p_paid_through (default last month, so billing starts this month),
-- never before the lease month (billing_start_for, D17). p_monthly_rent, when
-- given, prices the months from billing_start; otherwise the agreement rent
-- already on file must cover that month. The months up to this one are
-- created at once, so unpaid past months show as overdue.
create function start_rent_tracking(p_tenant_id uuid, p_monthly_rent numeric, p_paid_through date)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant record;
  v_start date;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  select status, tenant_kind, rent_tracked, lease_start into v_tenant from tenants where id = p_tenant_id for update;
  if not found then
    raise exception 'Tenant not found' using errcode = 'BBK04';
  end if;
  if v_tenant.status <> 'active' then
    raise exception 'Only a current tenant''s rent can be tracked' using errcode = 'BBK09';
  end if;
  if v_tenant.rent_tracked then
    raise exception 'This tenant''s rent is already tracked' using errcode = 'BBK09';
  end if;
  if p_paid_through is not null
    and date_trunc('month', p_paid_through) > date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '12 months' then
    raise exception 'Rent can''t have been paid more than a year ahead' using errcode = 'BBK00';
  end if;
  if p_monthly_rent is not null and p_monthly_rent <= 0 then
    raise exception 'Monthly rent must be more than zero' using errcode = 'BBK00';
  end if;

  v_start := billing_start_for(
    v_tenant.lease_start,
    coalesce(p_paid_through, (date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month')::date)
  );

  if p_monthly_rent is not null and rent_for_month(p_tenant_id, v_start) is distinct from round(p_monthly_rent, 2) then
    insert into tenant_rent_rates (tenant_id, effective_month, monthly_amount)
    values (p_tenant_id, v_start, round(p_monthly_rent, 2))
    on conflict (tenant_id, effective_month) do update set monthly_amount = excluded.monthly_amount;
  end if;
  if rent_for_month(p_tenant_id, v_start) is null then
    raise exception 'Enter the monthly rent' using errcode = 'BBK00';
  end if;

  update tenants set rent_tracked = true, billing_start = v_start where id = p_tenant_id;
  perform ensure_rent_periods(array[p_tenant_id], (now() at time zone 'Asia/Kolkata')::date);
  return v_start;
end;
$$;

-- Undoes start_rent_tracking while nothing is recorded against the months:
-- they are removed and the tenant is untracked again. After a payment or
-- adjustment, tracking stays on (removing months would rewrite the ledger).
create function stop_rent_tracking(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant record;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  select status, tenant_kind, rent_tracked into v_tenant from tenants where id = p_tenant_id for update;
  if not found then
    raise exception 'Tenant not found' using errcode = 'BBK04';
  end if;
  if v_tenant.status <> 'active' or v_tenant.tenant_kind <> 'government' then
    raise exception 'Only a current government tenant''s rent can go untracked' using errcode = 'BBK09';
  end if;
  if not v_tenant.rent_tracked then
    raise exception 'This tenant''s rent isn''t tracked' using errcode = 'BBK09';
  end if;
  if has_allocations_from(p_tenant_id, '-infinity'::date) then
    raise exception 'A payment is already recorded for this tenant, so rent tracking can''t be turned off'
      using errcode = 'BBK09';
  end if;

  delete from rent_periods where tenant_id = p_tenant_id;
  update tenants set rent_tracked = false, billing_start = null where id = p_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- correct_paid_through: only for a tracked tenant (otherwise as in 0014)
-- ---------------------------------------------------------------------------

create or replace function correct_paid_through(p_tenant_id uuid, p_paid_through date)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease_start date;
  v_status text;
  v_tracked boolean;
  v_old date;
  v_new date;
  v_first_rate date;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;

  select lease_start, status, rent_tracked, billing_start into v_lease_start, v_status, v_tracked, v_old
  from tenants where id = p_tenant_id
  for update;
  if not found then
    raise exception 'Tenant not found' using errcode = 'BBK04';
  end if;
  if v_status <> 'active' then
    raise exception 'Only a current tenant''s "paid up to" can be corrected' using errcode = 'BBK09';
  end if;
  if not v_tracked then
    raise exception 'This tenant''s rent isn''t tracked. Start tracking it instead.' using errcode = 'BBK09';
  end if;
  if p_paid_through is null then
    raise exception 'Choose the last month that was paid' using errcode = 'BBK00';
  end if;
  if date_trunc('month', p_paid_through) > date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '12 months' then
    raise exception 'Rent can''t have been paid more than a year ahead' using errcode = 'BBK00';
  end if;

  v_new := billing_start_for(v_lease_start, p_paid_through);
  if v_new = v_old then
    return v_old;
  end if;

  if v_new > v_old then
    if exists (
      select 1 from rent_periods r
      where r.tenant_id = p_tenant_id
        and r.period_month < v_new
        and (
          exists (select 1 from payment_allocations a where a.rent_period_id = r.id)
          or exists (select 1 from adjustment_allocations a where a.rent_period_id = r.id)
        )
    ) then
      raise exception 'A payment is recorded for a month before %, so it can''t be marked as paid on paper',
        to_char(v_new, 'FMMonth YYYY')
        using errcode = 'BBK09';
    end if;
    delete from rent_periods where tenant_id = p_tenant_id and period_month < v_new;
  end if;

  update tenants set billing_start = v_new where id = p_tenant_id;

  if v_new < v_old then
    -- The first rent rate starts with billing, so the new months are priced.
    select min(effective_month) into v_first_rate from tenant_rent_rates where tenant_id = p_tenant_id;
    if v_first_rate > v_new then
      update tenant_rent_rates set effective_month = v_new
      where tenant_id = p_tenant_id and effective_month = v_first_rate;
    end if;
    perform ensure_rent_periods(array[p_tenant_id], (v_old - interval '1 month')::date);
  end if;

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit: name the tracking switch (otherwise as in 0015)
-- ---------------------------------------------------------------------------

create or replace function audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_row jsonb := case when tg_op = 'DELETE' then v_old else v_new end;
  v_entity text := tg_argv[0];
  -- Bookkeeping, secrets and file paths: never part of the story.
  v_skip text[] := array[
    'id', 'created_at', 'updated_at', 'recorded_by', 'tenant_id', 'singleton',
    'token_hash', 'token_expires_at', 'owner_signature_path', 'tenant_signature_path',
    'pdf_path', 'otp_verified_at', 'storage_path', 'house_number', 'tower_code'
  ];
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_action text;
  v_unit text;
  v_property text;
  v_kind text;
begin
  -- Money movement is explained by the payment or adjustment itself.
  if tg_table_name in ('rent_periods', 'payments', 'adjustments') then
    v_skip := v_skip || array['amount_allocated', 'status', 'confirmed_at'];
  end if;

  for v_key in
    select k from jsonb_object_keys(v_old || v_new) as k where k <> all (v_skip)
  loop
    if (v_old -> v_key) is distinct from (v_new -> v_key)
      and not (tg_op = 'INSERT' and jsonb_typeof(v_new -> v_key) = 'null')
      and not (tg_op = 'DELETE' and jsonb_typeof(v_old -> v_key) = 'null')
    then
      v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_array(v_old -> v_key, v_new -> v_key));
    end if;
  end loop;

  if tg_op = 'UPDATE' and v_changes = '{}'::jsonb then
    return null;
  end if;

  v_action := case
    when tg_table_name = 'tenants' and tg_op = 'UPDATE' then
      case
        when v_changes ? 'status' and v_new ->> 'status' = 'inactive' then 'tenant.moved_out'
        when v_changes ? 'status' and v_new ->> 'status' = 'active' then 'tenant.activated'
        when v_changes ? 'rent_tracked' and (v_new ->> 'rent_tracked')::boolean then 'rent_tracking.started'
        when v_changes ? 'rent_tracked' then 'rent_tracking.stopped'
        when v_changes ? 'billing_start' then 'billing_start.corrected'
        else 'tenant.updated'
      end
    when tg_table_name = 'tenant_units' and tg_op = 'UPDATE' then
      case when v_old ->> 'end_date' is null and v_new ->> 'end_date' is not null then 'tenancy.ended' else 'tenancy.changed' end
    when tg_table_name in ('payments', 'adjustments') and tg_op = 'UPDATE' then
      case when v_changes ? 'acknowledged_at' then v_entity || '.acknowledged' else v_entity || '.changed' end
    when tg_table_name = 'tenant_units' and tg_op = 'INSERT' then 'tenancy.started'
    when tg_table_name in ('payments', 'adjustments') and tg_op = 'INSERT' then v_entity || '.recorded'
    when tg_table_name = 'tenant_documents' and tg_op = 'INSERT' then 'document.added'
    when tg_table_name = 'rent_periods' and tg_op = 'UPDATE' then 'rent_period.repriced'
    when tg_table_name = 'tenant_rent_rates' and tg_op = 'INSERT' then 'rent_rate.set'
    when tg_table_name = 'tenant_rent_rates' and tg_op = 'UPDATE' then 'rent_rate.changed'
    when tg_op = 'INSERT' then v_entity || '.created'
    when tg_op = 'UPDATE' then v_entity || '.updated'
    else v_entity || '.deleted'
  end;

  v_unit := v_row ->> 'unit_code';
  v_property := coalesce(
    v_row ->> 'property_code',
    (select u.property_code from units u where u.unit_code = v_unit)
  );

  v_kind := case
    when is_app_owner() then 'owner'
    when v_action like '%.acknowledged' then 'tenant'
    else 'system'
  end;

  insert into audit_log (actor_id, actor_kind, action, entity_type, entity_id, tenant_id, unit_code, property_code, changes)
  values (
    auth.uid(),
    v_kind,
    v_action,
    v_entity,
    coalesce(v_row ->> 'id', v_row ->> 'unit_code', v_row ->> 'property_code', v_row ->> 'location_code'),
    case when tg_table_name = 'tenants' then (v_row ->> 'id')::uuid else (v_row ->> 'tenant_id')::uuid end,
    v_unit,
    v_property,
    v_changes
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. create or replace keeps those of ensure_rent_periods,
-- correct_paid_through and audit_row_change.
-- ---------------------------------------------------------------------------

revoke all on function create_tenant(text, text, text, text, numeric, date, text[], date, numeric, text, boolean)
  from public, anon, authenticated;
revoke all on function update_tenant(uuid, text, text, text, text, text[], date, numeric, date, date, date, numeric, text, boolean)
  from public, anon, authenticated;
revoke all on function start_rent_tracking(uuid, numeric, date) from public, anon, authenticated;
revoke all on function stop_rent_tracking(uuid) from public, anon, authenticated;

grant execute on function create_tenant(text, text, text, text, numeric, date, text[], date, numeric, text, boolean)
  to authenticated;
grant execute on function update_tenant(uuid, text, text, text, text, text[], date, numeric, date, date, date, numeric, text, boolean)
  to authenticated;
grant execute on function start_rent_tracking(uuid, numeric, date) to authenticated;
grant execute on function stop_rent_tracking(uuid) to authenticated;
