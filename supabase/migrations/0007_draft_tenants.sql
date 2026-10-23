-- Draft tenants, and units as pure master data.
--
-- The paper register lists who occupies each house but not their phone,
-- rent or lease start. Those tenants are loaded as status = 'draft': they hold
-- their houses (so nobody else can be placed there) but are never billed.
-- Saving the missing phone + rent + lease start in the app (update_tenant)
-- turns a draft into an active tenant, and billing starts from the lease start.
--
-- units.register_note held those occupant names by mistake; occupants are
-- tenants, not attributes of a house, so the column goes.
-- See docs/database-design.md (D16).

alter table units drop column register_note;

-- ---------------------------------------------------------------------------
-- tenants: a 'draft' status; phone and lease start required once active
-- ---------------------------------------------------------------------------

alter table tenants drop constraint tenants_status_check;
alter table tenants
  add constraint tenants_status_check check (status in ('draft', 'active', 'inactive')),
  alter column phone drop not null,
  alter column lease_start drop not null,
  -- Active tenants are billed and messaged, so they need both. (A draft that
  -- was moved out without ever being completed is inactive without them.)
  add constraint tenants_active_has_phone check (status <> 'active' or phone is not null),
  add constraint tenants_active_has_lease_start check (status <> 'active' or lease_start is not null);

comment on column tenants.status is 'draft = from the paper register, details incomplete, not billed; active; inactive = moved out.';

-- Drafts are never billed, even when asked for explicitly.
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
      date_trunc('month', t.lease_start)::date,
      least(
        date_trunc('month', p_through)::date,
        coalesce(date_trunc('month', t.moved_out_on)::date, date_trunc('month', p_through)::date)
      ),
      interval '1 month'
    ) as gs
  ) as m
  where t.status <> 'draft'
    and ((p_tenant_ids is null and t.status = 'active') or (p_tenant_ids is not null and t.id = any (p_tenant_ids)))
    and rent_for_month(t.id, m.month) is not null
  on conflict (tenant_id, period_month) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_tenant gains p_lease_start, and completes drafts
-- ---------------------------------------------------------------------------

drop function update_tenant(uuid, text, text, text, text, text[], date, numeric, date);

-- Active tenant: as before (contact details; houses change from
-- p_units_effective; rent changes from p_rent_effective_month).
-- Draft tenant: contact details and the house set are saved as given (nothing
-- has been billed, so the provisional tenancies are simply replaced); when
-- phone, p_monthly_rent and p_lease_start are all present it becomes active:
-- its houses start on the lease start, its first rent rate is set, and
-- billing begins. p_lease_start is ignored for active tenants.
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
  p_lease_start date
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
        -- Houses kept as they were: they start on the lease start now.
        begin
          update tenant_units set start_date = p_lease_start where tenant_id = p_tenant_id and end_date is null;
        exception when exclusion_violation then
          raise exception 'A house was still occupied by someone else on %', p_lease_start using errcode = 'BBK09';
        end;
      end if;
      update tenants set status = 'active', lease_start = p_lease_start where id = p_tenant_id;
      insert into tenant_rent_rates (tenant_id, effective_month, monthly_amount)
      values (p_tenant_id, date_trunc('month', p_lease_start)::date, round(p_monthly_rent, 2))
      on conflict (tenant_id, effective_month) do update set monthly_amount = excluded.monthly_amount;
    elsif p_monthly_rent is not null or p_lease_start is not null then
      raise exception 'To start billing, enter the phone, monthly rent and lease start together'
        using errcode = 'BBK00';
    end if;
    return;
  end if;

  -- ---- Active / moved out: unchanged behaviour from 0006 ----
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

-- A draft that turns out not to be there any more can be moved out too.
create or replace function move_out_tenant(p_tenant_id uuid, p_move_out_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_bad record;
  v_after date;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  select status into v_status from tenants where id = p_tenant_id for update;
  if v_status is null then
    raise exception 'Tenant not found' using errcode = 'BBK04';
  end if;
  if v_status = 'inactive' then
    raise exception 'This tenant has already moved out' using errcode = 'BBK09';
  end if;
  if p_move_out_date is null then
    raise exception 'Choose the move-out date' using errcode = 'BBK00';
  end if;

  if v_status = 'draft' then
    -- Never billed: provisional tenancies simply end (or vanish if they
    -- would end before they started).
    delete from tenant_units where tenant_id = p_tenant_id and start_date > p_move_out_date;
    update tenant_units set end_date = p_move_out_date where tenant_id = p_tenant_id and end_date is null;
    update tenants set status = 'inactive', moved_out_on = p_move_out_date where id = p_tenant_id;
    return;
  end if;

  select unit_code, start_date into v_bad
  from tenant_units
  where tenant_id = p_tenant_id and end_date is null and start_date > p_move_out_date
  limit 1;
  if found then
    raise exception 'The move-out date is before % moved in (%)', v_bad.unit_code, v_bad.start_date
      using errcode = 'BBK00';
  end if;

  v_after := (date_trunc('month', p_move_out_date) + interval '1 month')::date;
  if has_allocations_from(p_tenant_id, v_after) then
    raise exception 'A payment is already recorded for a month after the move-out. Correct it with an adjustment first.'
      using errcode = 'BBK09';
  end if;

  update tenant_units set end_date = p_move_out_date where tenant_id = p_tenant_id and end_date is null;
  update tenants set status = 'inactive', moved_out_on = p_move_out_date where id = p_tenant_id;
  delete from rent_periods where tenant_id = p_tenant_id and period_month >= v_after;
end;
$$;

revoke all on function update_tenant(uuid, text, text, text, text, text[], date, numeric, date, date)
  from public, anon, authenticated;
grant execute on function update_tenant(uuid, text, text, text, text, text[], date, numeric, date, date) to authenticated;
-- create or replace keeps the grants of ensure_rent_periods and move_out_tenant.
