-- Billing start is separate from lease start.
--
-- lease_start is history: when the tenant moved in (it also dates their
-- tenancies). billing_start is the first month this app bills. For tenants
-- moved over from the paper register, rent up to some month was already
-- settled on paper: the owner enters "rent paid up to <month>" and billing
-- starts the month after - otherwise a lease start years ago would create years
-- of rent "due" that was actually paid. See docs/database-design.md (D17).
--
-- Also adds the optional security deposit, which is fixed once the tenant is
-- active: it can be set when onboarding or freely while a draft, and never
-- changed after (D18).

alter table tenants
  add column billing_start date,
  add constraint tenants_billing_start_is_month
    check (billing_start is null or billing_start = date_trunc('month', billing_start)::date);

update tenants set billing_start = date_trunc('month', lease_start)::date where lease_start is not null;

alter table tenants
  add constraint tenants_active_has_billing_start check (status <> 'active' or billing_start is not null);

comment on column tenants.billing_start is
  'First month billed by the app (1st of the month). Earlier rent was settled outside it (paper register).';
-- ---------------------------------------------------------------------------
-- Security deposit: optional, editable only while the tenant is a draft
-- ---------------------------------------------------------------------------

alter table tenants
  add column deposit_amount numeric(12, 2),
  add constraint tenants_deposit_positive check (deposit_amount is null or deposit_amount > 0);

comment on column tenants.deposit_amount is
  'Security deposit held (optional). Set when onboarding or while a draft; frozen once the tenant is active.';

-- Enforced here rather than only in update_tenant, so no code path (including
-- SECURITY DEFINER functions or the SQL editor as a non-superuser) can change
-- a submitted deposit.
create or replace function deposit_frozen_after_draft()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft' and new.deposit_amount is distinct from old.deposit_amount then
    raise exception 'The deposit can''t be changed once the tenant is active' using errcode = 'BBK09';
  end if;
  return new;
end;
$$;

create trigger tenants_deposit_frozen before update of deposit_amount on tenants
  for each row execute function deposit_frozen_after_draft();

comment on column tenants.lease_start is 'When the tenant moved in (history; dates their tenancies). Billing uses billing_start.';

-- The month after "paid up to", never before the lease month; with nothing
-- paid in advance, the lease month itself.
create or replace function billing_start_for(p_lease_start date, p_paid_through date)
returns date
language sql
immutable
set search_path = public
as $$
  select greatest(
    date_trunc('month', p_lease_start)::date,
    coalesce((date_trunc('month', p_paid_through) + interval '1 month')::date, date_trunc('month', p_lease_start)::date)
  );
$$;

-- Months are generated from billing_start (was lease_start).
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
    and t.billing_start is not null
    and ((p_tenant_ids is null and t.status = 'active') or (p_tenant_ids is not null and t.id = any (p_tenant_ids)))
    and rent_for_month(t.id, m.month) is not null
  on conflict (tenant_id, period_month) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_tenant: optional p_paid_through
-- ---------------------------------------------------------------------------

drop function create_tenant(text, text, text, text, numeric, date, text[]);

create or replace function create_tenant(
  p_name text,
  p_business_name text,
  p_phone text,
  p_preferred_channel text,
  p_monthly_rent numeric,
  p_lease_start date,
  p_unit_codes text[],
  p_paid_through date default null,
  p_deposit_amount numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_billing_start date := billing_start_for(p_lease_start, p_paid_through);
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  if p_monthly_rent is null or p_monthly_rent <= 0 then
    raise exception 'Monthly rent must be more than zero' using errcode = 'BBK00';
  end if;
  perform assert_units_available(p_unit_codes, p_lease_start);

  insert into tenants (name, business_name, phone, preferred_channel, lease_start, billing_start, deposit_amount)
  values (
    p_name, nullif(btrim(p_business_name), ''), p_phone, p_preferred_channel, p_lease_start, v_billing_start,
    round(p_deposit_amount, 2)
  )
  returning id into v_id;

  insert into tenant_rent_rates (tenant_id, effective_month, monthly_amount)
  values (v_id, v_billing_start, round(p_monthly_rent, 2));

  -- Tenancies are history: they start when the tenant moved in.
  insert into tenant_units (tenant_id, unit_code, start_date)
  select v_id, c, p_lease_start from unnest(p_unit_codes) as c;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_tenant: p_paid_through when a draft is completed
-- ---------------------------------------------------------------------------

drop function update_tenant(uuid, text, text, text, text, text[], date, numeric, date, date);

-- As in 0007, except that activating a draft sets billing_start from
-- p_paid_through (default: last month, so billing starts this month) and the
-- first rent rate takes effect from that month. p_paid_through is ignored for
-- tenants that are already active. p_deposit_amount: a draft's deposit is
-- saved as given (null clears it); for anyone else it must be null or equal to
-- the stored deposit - it is frozen once the tenant is active.
create or replace function update_tenant(
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
  p_deposit_amount numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_current text[];
  v_removed text[];
  v_added text[];
  v_bad record;
  v_month date;
  v_billing_start date;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  select status into v_status from tenants where id = p_tenant_id for update;
  if v_status is null then
    raise exception 'Tenant not found' using errcode = 'BBK04';
  end if;

  if v_status <> 'draft' and nullif(btrim(p_phone), '') is null then
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
      preferred_channel = p_preferred_channel
  where id = p_tenant_id;

  -- ---- Draft: replace the provisional house set, activate when complete ----
  if v_status = 'draft' then
    if p_unit_codes is not null then
      if cardinality(p_unit_codes) = 0 then
        raise exception 'A tenant must keep at least one house' using errcode = 'BBK00';
      end if;
      delete from tenant_units where tenant_id = p_tenant_id;
      perform assert_units_available(p_unit_codes, coalesce(p_lease_start, current_date));
      insert into tenant_units (tenant_id, unit_code, start_date)
      select p_tenant_id, c, coalesce(p_lease_start, current_date) from unnest(p_unit_codes) as c;
    end if;

    if nullif(btrim(p_phone), '') is not null and p_monthly_rent is not null and p_lease_start is not null then
      if p_monthly_rent <= 0 then
        raise exception 'Monthly rent must be more than zero' using errcode = 'BBK00';
      end if;
      if p_unit_codes is null then
        begin
          update tenant_units set start_date = p_lease_start where tenant_id = p_tenant_id and end_date is null;
        exception when exclusion_violation then
          raise exception 'A house was still occupied by someone else on %', p_lease_start using errcode = 'BBK09';
        end;
      end if;
      v_billing_start := billing_start_for(
        p_lease_start,
        coalesce(p_paid_through, (date_trunc('month', current_date) - interval '1 month')::date)
      );
      update tenants
      set status = 'active', lease_start = p_lease_start, billing_start = v_billing_start
      where id = p_tenant_id;
      insert into tenant_rent_rates (tenant_id, effective_month, monthly_amount)
      values (p_tenant_id, v_billing_start, round(p_monthly_rent, 2))
      on conflict (tenant_id, effective_month) do update set monthly_amount = excluded.monthly_amount;
    elsif p_monthly_rent is not null or p_lease_start is not null then
      raise exception 'To start billing, enter the phone, monthly rent and lease start together'
        using errcode = 'BBK00';
    end if;
    return;
  end if;

  -- ---- Active / moved out: unchanged from 0007 ----
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
-- Grants (same pattern as 0004/0006)
-- ---------------------------------------------------------------------------

revoke all on function billing_start_for(date, date) from public, anon, authenticated;
revoke all on function deposit_frozen_after_draft() from public, anon, authenticated;
revoke all on function create_tenant(text, text, text, text, numeric, date, text[], date, numeric)
  from public, anon, authenticated;
revoke all on function update_tenant(uuid, text, text, text, text, text[], date, numeric, date, date, date, numeric)
  from public, anon, authenticated;

grant execute on function create_tenant(text, text, text, text, numeric, date, text[], date, numeric) to authenticated;
grant execute on function update_tenant(uuid, text, text, text, text, text[], date, numeric, date, date, date, numeric)
  to authenticated;
-- create or replace keeps ensure_rent_periods' grants (service_role only).
