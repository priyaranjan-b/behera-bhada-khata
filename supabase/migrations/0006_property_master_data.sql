-- Property master data: Site (locations) -> Tower (properties) -> House (units),
-- identified by permanent codes (AC, AC-T1, AC-T1-G01), and tenants linked to
-- houses through a dated occupancy history (tenant_units) with a versioned
-- combined rent (tenant_rent_rates). Billing stays per tenant: rent_periods,
-- payments and adjustments still hang off tenants.id.
--
-- Design rules (see docs/database-design.md):
--   * codes are primary keys and never change (prevent_key_change trigger);
--   * single owner: access is is_app_owner() (0003), there is no owner_id;
--   * occupancy and rent history are append-only for the owner: they change
--     only through create_tenant / update_tenant / move_out_tenant, which add
--     rows or close an open one, never rewrite a closed one;
--   * nothing is deleted: houses are retired with is_active = false.
--
-- This migration rebuilds properties and drops tenant columns, so it refuses
-- to run on a database that already has properties or tenants. For test data,
-- run supabase/scripts/reset_owner_data.sql first.

do $$
begin
  if exists (select 1 from tenants) or exists (select 1 from properties) then
    raise exception 'Migration 0006 rebuilds properties and tenants. Run supabase/scripts/reset_owner_data.sql first (test data only).';
  end if;
end;
$$;

-- On Supabase extensions live in their own schema.
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Codes are printed on receipts and referenced everywhere: rename via `name`,
-- never by changing the code. TG_ARGV[0] is the key column's name.
create or replace function prevent_key_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if to_jsonb(new) ->> tg_argv[0] is distinct from to_jsonb(old) ->> tg_argv[0] then
    raise exception '% can''t be changed once created', tg_argv[0] using errcode = 'BBK00';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Replace the old properties table and the free-text unit columns on tenants
-- ---------------------------------------------------------------------------

alter table tenants
  drop column property_id,
  drop column unit_type,
  drop column tower,
  drop column floor,
  drop column house_number,
  drop column monthly_rent_amount,
  add column moved_out_on date,
  add column updated_at timestamptz not null default now(),
  add constraint tenants_phone_e164 check (phone ~ '^\+[1-9][0-9]{7,14}$');

drop table properties;

create table locations (
  location_code text primary key check (location_code ~ '^[A-Z]{2,4}$'),
  name text not null check (btrim(name) <> ''),
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table properties (
  property_code text primary key check (property_code ~ '^[A-Z]{2,4}-T[A-Z0-9]{1,3}$'),
  location_code text not null references locations (location_code) on update restrict on delete restrict,
  tower_code text generated always as (split_part(property_code, '-', 2)) stored,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_code_in_location check (property_code like location_code || '-%')
);

create index properties_location_idx on properties (location_code);

create table units (
  unit_code text primary key check (unit_code ~ '^[A-Z]{2,4}-T[A-Z0-9]{1,3}-[A-Z0-9]{1,4}$'),
  property_code text not null references properties (property_code) on update restrict on delete restrict,
  house_number text generated always as (split_part(unit_code, '-', 3)) stored,
  -- 'G' ground, 'B'/'B1' basement, '1'..'99'; null where the register has no floor.
  floor text check (floor is null or floor ~ '^(G|B[0-9]?|[0-9]{1,2})$'),
  unit_type text not null check (unit_type in ('residential', 'commercial')),
  label text,
  register_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint units_code_in_property check (unit_code like property_code || '-%')
);

create index units_property_idx on units (property_code);

create table tenant_units (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references tenants (id) on update restrict on delete restrict,
  unit_code text not null references units (unit_code) on update restrict on delete restrict,
  start_date date not null,
  -- Last day of occupancy (inclusive); null while the tenant is still there.
  end_date date,
  created_at timestamptz not null default now(),
  constraint tenant_units_dates check (end_date is null or end_date >= start_date),
  -- One occupant per house at any moment; back-to-back tenancies are fine.
  constraint tenant_units_no_overlap
    exclude using gist (unit_code with =, daterange(start_date, end_date, '[]') with &&)
);

create index tenant_units_tenant_idx on tenant_units (tenant_id);

create table tenant_rent_rates (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references tenants (id) on update restrict on delete restrict,
  effective_month date not null check (effective_month = date_trunc('month', effective_month)::date),
  monthly_amount numeric(12, 2) not null check (monthly_amount > 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, effective_month)
);

-- Triggers on the master tables.
create trigger locations_updated_at before update on locations for each row execute function set_updated_at();
create trigger properties_updated_at before update on properties for each row execute function set_updated_at();
create trigger units_updated_at before update on units for each row execute function set_updated_at();
create trigger tenants_updated_at before update on tenants for each row execute function set_updated_at();

create trigger locations_key_frozen before update on locations
  for each row execute function prevent_key_change('location_code');
create trigger properties_key_frozen before update on properties
  for each row execute function prevent_key_change('property_code');
create trigger properties_location_frozen before update on properties
  for each row execute function prevent_key_change('location_code');
create trigger units_key_frozen before update on units
  for each row execute function prevent_key_change('unit_code');
create trigger units_property_frozen before update on units
  for each row execute function prevent_key_change('property_code');

-- "Who lived where, when". security_invoker: the caller's RLS applies.
create view unit_occupancy with (security_invoker = true) as
select
  tu.unit_code,
  u.property_code,
  tu.tenant_id,
  t.name as tenant_name,
  t.business_name as tenant_business_name,
  tu.start_date,
  tu.end_date,
  (tu.start_date <= current_date and (tu.end_date is null or tu.end_date >= current_date)) as is_current
from tenant_units tu
join units u on u.unit_code = tu.unit_code
join tenants t on t.id = tu.tenant_id;

-- ---------------------------------------------------------------------------
-- Indexes: drop the ones a unique constraint already provides, add the ones
-- the dashboard queries actually use.
-- ---------------------------------------------------------------------------

drop index if exists payments_token_hash_idx;          -- unique (token_hash)
drop index if exists adjustments_token_hash_idx;       -- unique (token_hash)
drop index if exists rent_periods_tenant_id_idx;       -- unique (tenant_id, period_month)
drop index if exists payment_allocations_payment_id_idx;       -- unique (payment_id, rent_period_id)
drop index if exists adjustment_allocations_adjustment_id_idx; -- unique (adjustment_id, rent_period_id)
drop index if exists payments_tenant_id_idx;
drop index if exists adjustments_tenant_id_idx;

create index payments_tenant_date_idx on payments (tenant_id, payment_date);
create index adjustments_tenant_confirmed_idx on adjustments (tenant_id, confirmed_at);
create index rent_periods_open_idx on rent_periods (tenant_id, period_month) where status <> 'paid';

-- ---------------------------------------------------------------------------
-- Row Level Security (single owner, see 0003)
-- ---------------------------------------------------------------------------

alter table locations enable row level security;
alter table properties enable row level security;
alter table units enable row level security;
alter table tenant_units enable row level security;
alter table tenant_rent_rates enable row level security;

create policy "owner manages locations" on locations
  for all to authenticated using (is_app_owner()) with check (is_app_owner());

create policy "owner manages properties" on properties
  for all to authenticated using (is_app_owner()) with check (is_app_owner());

create policy "owner manages units" on units
  for all to authenticated using (is_app_owner()) with check (is_app_owner());

-- History: readable by the owner, written only by the functions below.
create policy "owner reads tenancies" on tenant_units
  for select to authenticated using (is_app_owner());

create policy "owner reads rent rates" on tenant_rent_rates
  for select to authenticated using (is_app_owner());

revoke all on locations, properties, units, tenant_units, tenant_rent_rates, unit_occupancy from anon;
revoke delete on locations, properties, units from authenticated;
revoke insert, update, delete on tenant_units, tenant_rent_rates from authenticated;
-- Tenants are created, edited and moved out through the functions too.
revoke insert, update, delete on tenants from authenticated;

-- ---------------------------------------------------------------------------
-- Rent: the rate in effect for a month, and period upkeep priced from it
-- ---------------------------------------------------------------------------

create or replace function rent_for_month(p_tenant_id uuid, p_month date)
returns numeric
language sql
stable
set search_path = public
as $$
  select monthly_amount
  from tenant_rent_rates
  where tenant_id = p_tenant_id and effective_month <= p_month
  order by effective_month desc
  limit 1;
$$;

-- Replaces 0004's version: prices each month from tenant_rent_rates and
-- never bills past a moved-out tenant's move-out month.
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
  where ((p_tenant_ids is null and t.status = 'active') or (p_tenant_ids is not null and t.id = any (p_tenant_ids)))
    and rent_for_month(t.id, m.month) is not null
  on conflict (tenant_id, period_month) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenant lifecycle (run as the owner; SECURITY DEFINER because they write the
-- history tables and rent_periods the owner can't write directly - each one
-- starts by checking is_app_owner())
-- ---------------------------------------------------------------------------

-- Every listed house exists, is in use and is free from p_from; raises otherwise.
create or replace function assert_units_available(p_unit_codes text[], p_from date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_missing text;
  v_taken record;
begin
  if coalesce(cardinality(p_unit_codes), 0) = 0 then
    raise exception 'Choose at least one house' using errcode = 'BBK00';
  end if;
  if (select count(distinct c) from unnest(p_unit_codes) as c) <> cardinality(p_unit_codes) then
    raise exception 'Each house can only be chosen once' using errcode = 'BBK00';
  end if;

  select string_agg(c, ', ' order by c) into v_missing
  from unnest(p_unit_codes) as c
  where not exists (select 1 from units u where u.unit_code = c and u.is_active);
  if v_missing is not null then
    raise exception 'House not found or no longer in use: %', v_missing using errcode = 'BBK00';
  end if;

  select tu.unit_code, t.name, tu.start_date, tu.end_date into v_taken
  from tenant_units tu
  join tenants t on t.id = tu.tenant_id
  where tu.unit_code = any (p_unit_codes)
    and daterange(tu.start_date, tu.end_date, '[]') && daterange(p_from, null, '[]')
  order by tu.unit_code
  limit 1;
  if found then
    raise exception '% is occupied by % (from % to %)',
      v_taken.unit_code, v_taken.name, v_taken.start_date, coalesce(v_taken.end_date::text, 'now')
      using errcode = 'BBK09';
  end if;
end;
$$;

-- Months on or after p_from that already have a payment or adjustment against them.
create or replace function has_allocations_from(p_tenant_id uuid, p_from date)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from rent_periods r
    where r.tenant_id = p_tenant_id and r.period_month >= p_from
      and (
        r.amount_allocated <> 0
        or exists (select 1 from payment_allocations pa where pa.rent_period_id = r.id)
        or exists (select 1 from adjustment_allocations aa where aa.rent_period_id = r.id)
      )
  );
$$;

create or replace function create_tenant(
  p_name text,
  p_business_name text,
  p_phone text,
  p_preferred_channel text,
  p_monthly_rent numeric,
  p_lease_start date,
  p_unit_codes text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  if p_monthly_rent is null or p_monthly_rent <= 0 then
    raise exception 'Monthly rent must be more than zero' using errcode = 'BBK00';
  end if;
  perform assert_units_available(p_unit_codes, p_lease_start);

  insert into tenants (name, business_name, phone, preferred_channel, lease_start)
  values (p_name, nullif(btrim(p_business_name), ''), p_phone, p_preferred_channel, p_lease_start)
  returning id into v_id;

  insert into tenant_rent_rates (tenant_id, effective_month, monthly_amount)
  values (v_id, date_trunc('month', p_lease_start)::date, round(p_monthly_rent, 2));

  insert into tenant_units (tenant_id, unit_code, start_date)
  select v_id, c, p_lease_start from unnest(p_unit_codes) as c;

  return v_id;
end;
$$;

-- Edits contact details, reconciles the house set as of p_units_effective and
-- changes the combined rent from p_rent_effective_month. Null rent/house
-- arguments mean "unchanged".
create or replace function update_tenant(
  p_tenant_id uuid,
  p_name text,
  p_business_name text,
  p_phone text,
  p_preferred_channel text,
  p_unit_codes text[],
  p_units_effective date,
  p_monthly_rent numeric,
  p_rent_effective_month date
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

  update tenants
  set name = p_name,
      business_name = nullif(btrim(p_business_name), ''),
      phone = p_phone,
      preferred_channel = p_preferred_channel
  where id = p_tenant_id;

  -- Houses
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

  -- Combined rent
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

      -- Rewriting a rate is only possible while no month it priced has been
      -- paid (checked just above), so history that money touched never changes.
      insert into tenant_rent_rates (tenant_id, effective_month, monthly_amount)
      values (p_tenant_id, v_month, round(p_monthly_rent, 2))
      on conflict (tenant_id, effective_month) do update set monthly_amount = excluded.monthly_amount;

      -- Re-price the already-created, untouched months from then on.
      update rent_periods r
      set amount_due = rent_for_month(p_tenant_id, r.period_month)
      where r.tenant_id = p_tenant_id and r.period_month >= v_month;
    end if;
  end if;
end;
$$;

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
  if v_status <> 'active' then
    raise exception 'This tenant has already moved out' using errcode = 'BBK09';
  end if;
  if p_move_out_date is null then
    raise exception 'Choose the move-out date' using errcode = 'BBK00';
  end if;

  select unit_code, start_date into v_bad
  from tenant_units
  where tenant_id = p_tenant_id and end_date is null and start_date > p_move_out_date
  limit 1;
  if found then
    raise exception 'The move-out date is before % moved in (%)', v_bad.unit_code, v_bad.start_date
      using errcode = 'BBK00';
  end if;

  -- The move-out month is billed; anything after it must be untouched.
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

-- ---------------------------------------------------------------------------
-- Function grants (same pattern as 0004)
-- ---------------------------------------------------------------------------

revoke all on function set_updated_at() from public, anon, authenticated;
revoke all on function prevent_key_change() from public, anon, authenticated;
revoke all on function rent_for_month(uuid, date) from public, anon, authenticated;
revoke all on function ensure_rent_periods(uuid[], date) from public, anon, authenticated;
revoke all on function assert_units_available(text[], date) from public, anon, authenticated;
revoke all on function has_allocations_from(uuid, date) from public, anon, authenticated;
revoke all on function create_tenant(text, text, text, text, numeric, date, text[]) from public, anon, authenticated;
revoke all on function update_tenant(uuid, text, text, text, text, text[], date, numeric, date)
  from public, anon, authenticated;
revoke all on function move_out_tenant(uuid, date) from public, anon, authenticated;

grant execute on function rent_for_month(uuid, date) to service_role;
grant execute on function ensure_rent_periods(uuid[], date) to service_role;
grant execute on function create_tenant(text, text, text, text, numeric, date, text[]) to authenticated;
grant execute on function update_tenant(uuid, text, text, text, text, text[], date, numeric, date) to authenticated;
grant execute on function move_out_tenant(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Documentation (shown in Supabase Studio)
-- ---------------------------------------------------------------------------

comment on table locations is 'A site the owner rents out, e.g. AC = Arnapal Chakk Complex.';
comment on table properties is 'A tower/building within a location, e.g. AC-T1. property_code is permanent.';
comment on table units is 'A rentable house/shop/room, e.g. AC-T1-G01. Retire with is_active = false; never delete.';
comment on column units.house_number is 'Derived from unit_code (the part after the tower).';
comment on column units.register_note is 'Free-text note, e.g. the occupant recorded in the paper register.';
comment on table tenant_units is 'Which houses a tenant occupies, and when. end_date is the last day (inclusive); null = current. Append-only for the owner.';
comment on table tenant_rent_rates is 'A tenant''s combined monthly rent over time; the latest effective_month <= a month prices it.';
comment on column tenants.moved_out_on is 'Set by move_out_tenant; no rent is billed after this month.';
comment on view unit_occupancy is 'Occupancy history per house (who lived where, when).';
