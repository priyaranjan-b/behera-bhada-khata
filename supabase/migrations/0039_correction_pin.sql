-- Corrections confirmed with a PIN (D41 in docs/database-design.md, A35).
--
-- The functions that rewrite what the ledger says - correct_paid_through,
-- correct_rent, correct_move_out, create_adjustment, stop_rent_tracking and a
-- backdated move_out_tenant - need a one-time ticket that only the right
-- corrections PIN produces, checked here rather than in the app: the owner's
-- session can call these functions directly over the Supabase REST API, and
-- that session could change the login password, so the password can't be
-- the check.
--
--   in ONE transaction: verify_correction_pin(pin, action, target) leaves a
--   ticket row; the gated function uses it up; commit.
--
-- The ticket is never committed on its own, so no other session can see or
-- use it, and a refused correction takes it back with everything else. A
-- wrong PIN returns (never raises), so the app commits the failure count.
-- 5 wrong in a row lock corrections for 15 minutes; 10 in a day for 24
-- hours. A right PIN clears both counts.
--
-- The first PIN, or a new one after it's forgotten, can only be set while
-- setup is open, which only the Supabase SQL editor can do
-- (supabase/scripts/open_correction_pin_setup.sql, 15 minutes): a stolen app
-- session can't set the PIN first.
--
-- The originals move to the schema `private` (not exposed over REST, no
-- grants) as <fn>_unchecked, unchanged; public.<fn> keeps the name and the
-- arguments, uses up the ticket and calls them. update_tenant refuses a rent
-- change from a past month outright (Correct rent is the tool for that).
-- Safe to run again. Undo: supabase/rollback/0039_correction_pin.sql.
--
-- Run it right before deploying the release that sends the PIN: in between,
-- every correction in the live app is refused.

begin;

create schema if not exists private;
revoke all on schema private from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon, authenticated, service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The PIN and its tickets: no grants, RLS on with no policies. Only the
-- functions below (SECURITY DEFINER) read or write them. No audit trigger:
-- it would copy the hash into audit_log; events go through
-- log_correction_event.
-- ---------------------------------------------------------------------------

create table if not exists correction_guard (
  singleton boolean primary key default true check (singleton),
  pin_hash text,
  pin_salt text,
  pin_set_at timestamptz,
  -- Open only from the SQL editor (open_correction_pin_setup.sql).
  setup_until timestamptz,
  failed_attempts integer not null default 0,
  failures_today integer not null default 0,
  failures_day date,
  locked_until timestamptz,
  check ((pin_hash is null) = (pin_salt is null))
);

create table if not exists correction_tickets (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_id uuid not null,
  expires_at timestamptz not null
);

alter table correction_guard enable row level security;
alter table correction_tickets enable row level security;
revoke all on correction_guard, correction_tickets from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on correction_guard, correction_tickets from anon, authenticated, service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'tenant_reader') then
    execute 'revoke all on correction_guard, correction_tickets from tenant_reader';
  end if;
end $$;

comment on table correction_guard is
  'The corrections PIN (salted, iterated sha256), setup window, failure counts and lockout (D41). Read and written only by the correction PIN functions.';
comment on table correction_tickets is
  'One-time tickets from verify_correction_pin, each for one action on one record, used up in the same transaction (D41).';

-- Salted sha256, iterated: PGlite (the tests) has no pgcrypto. 6 digits are
-- few, so the lockout is what stops guessing; the iterations only slow down
-- someone who has read the table (who has the ledger anyway).
create or replace function correction_pin_hash(p_salt text, p_pin text)
returns text
language plpgsql
immutable
as $$
declare
  v_hash bytea := sha256(convert_to(p_salt || ':' || p_pin, 'UTF8'));
  v_salt bytea := convert_to(p_salt, 'UTF8');
begin
  for i in 1..2000 loop
    v_hash := sha256(v_hash || v_salt);
  end loop;
  return encode(v_hash, 'hex');
end;
$$;

-- What each ticket is for (CORRECTION_ACTIONS / CORRECTION_ACTION_LABELS in
-- the app); null = not a correction.
create or replace function correction_action_label(p_action text)
returns text
language sql
immutable
as $$
  select case p_action
    when 'paid_through' then 'Correct "rent paid up to"'
    when 'rent' then 'Correct rent'
    when 'move_out_date' then 'Correct move-out date'
    when 'adjustment' then 'Adjust a payment'
    when 'stop_tracking' then 'Stop tracking rent'
    when 'move_out' then 'Move out with an earlier date'
  end
$$;

-- The tenant a correction is about (an adjustment's target is the payment).
create or replace function correction_target_tenant(p_action text, p_target uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when p_action = 'adjustment'
    then (select tenant_id from payments where id = p_target)
    else p_target
  end
$$;

-- Writes a PIN event to the audit log. Not log_event, which the owner's
-- session may call: these rows are the evidence of how the PIN was used, so
-- only the PIN functions (and the SQL editor) can write them.
create or replace function log_correction_event(p_action text, p_tenant_id uuid default null, p_detail text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (actor_id, actor_kind, action, entity_type, entity_id, tenant_id, context)
  values (
    case when is_app_owner() then auth.uid() end,
    case when is_app_owner() then 'owner' else 'system' end,
    p_action,
    split_part(p_action, '.', 1),
    null,
    p_tenant_id,
    case when p_detail is null then '{}'::jsonb else jsonb_build_object('detail', p_detail) end
  );
end;
$$;

-- What the app shows on Profile and before a correction.
create or replace function correction_pin_status(
  out pin_set boolean, out pin_set_at timestamptz, out locked_until timestamptz, out setup_until timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  select g.pin_hash is not null, g.pin_set_at,
         case when g.locked_until > now() then g.locked_until end,
         case when g.pin_hash is null and g.setup_until > now() then g.setup_until end
  into pin_set, pin_set_at, locked_until, setup_until
  from correction_guard g;
  pin_set := coalesce(pin_set, false);
end;
$$;

-- Raises while locked out (no state changes, so raising is fine).
create or replace function correction_pin_assert_unlocked(p_locked_until timestamptz)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_locked_until > now() then
    raise exception 'Too many wrong PINs. Corrections are locked until %',
      to_char(p_locked_until at time zone 'Asia/Kolkata', 'DD/MM/YYYY HH24:MI')
      using errcode = 'BBK09';
  end if;
end;
$$;

-- Counts a wrong PIN for p_action on p_target; returns the tries left before
-- the next lockout (0 = locked now).
create or replace function correction_pin_failed(p_action text, p_target uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_tenant uuid := case when p_target is null then null else correction_target_tenant(p_action, p_target) end;
  v_guard correction_guard;
begin
  update correction_guard
  set failed_attempts = failed_attempts + 1,
      failures_today = case when failures_day = v_today then failures_today + 1 else 1 end,
      failures_day = v_today
  returning * into v_guard;

  perform log_correction_event('correction_pin.failed', v_tenant, coalesce(correction_action_label(p_action), 'Changing the PIN'));
  if v_guard.failures_today >= 10 then
    update correction_guard set locked_until = now() + interval '24 hours', failed_attempts = 0;
    perform log_correction_event('correction_pin.locked', v_tenant, 'For 24 hours: 10 wrong PINs today');
    return 0;
  end if;
  if v_guard.failed_attempts >= 5 then
    update correction_guard set locked_until = now() + interval '15 minutes', failed_attempts = 0;
    perform log_correction_event('correction_pin.locked', v_tenant, 'For 15 minutes: 5 wrong PINs in a row');
    return 0;
  end if;
  return 5 - v_guard.failed_attempts;
end;
$$;

-- Sets the first PIN while setup is open (from the SQL editor), or changes it
-- with the current one: a wrong current PIN counts as a failure (ok = false),
-- so changing the PIN can't be used to guess it.
create or replace function set_correction_pin(
  p_new text, p_old text default null, out ok boolean, out tries_left integer, out locked_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guard correction_guard;
  v_salt text := replace(gen_random_uuid()::text, '-', '');
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  if p_new is null or p_new !~ '^[0-9]{6}$' then
    raise exception 'The PIN must be 6 digits' using errcode = 'BBK00';
  end if;

  select * into v_guard from correction_guard for update;
  if not found or (v_guard.pin_hash is null and coalesce(v_guard.setup_until <= now(), true)) then
    raise exception 'PIN setup is closed. Open it from the Supabase SQL editor first (open_correction_pin_setup.sql).'
      using errcode = 'BBK09';
  end if;

  if v_guard.pin_hash is not null then
    perform correction_pin_assert_unlocked(v_guard.locked_until);
    if p_old is null or correction_pin_hash(v_guard.pin_salt, p_old) <> v_guard.pin_hash then
      ok := false;
      tries_left := correction_pin_failed(null, null);
      select g.locked_until into locked_until from correction_guard g;
      return;
    end if;
  end if;

  update correction_guard
  set pin_hash = correction_pin_hash(v_salt, p_new), pin_salt = v_salt, pin_set_at = now(), setup_until = null,
      failed_attempts = 0, failures_today = 0, locked_until = null;
  delete from correction_tickets;
  perform log_correction_event(case when v_guard.pin_hash is null then 'correction_pin.set' else 'correction_pin.changed' end);
  ok := true;
  tries_left := null;
  locked_until := null;
end;
$$;

-- In the same transaction as the correction: a right PIN leaves a one-time
-- ticket for p_action on p_target (ok); a wrong one returns the tries left
-- and when corrections unlock, if they locked. Never raises on a wrong PIN.
create or replace function verify_correction_pin(
  p_pin text, p_action text, p_target uuid, out ok boolean, out tries_left integer, out locked_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guard correction_guard;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  if correction_action_label(p_action) is null or p_target is null then
    raise exception 'Unknown correction' using errcode = 'BBK00';
  end if;

  select * into v_guard from correction_guard for update;
  if not found or v_guard.pin_hash is null then
    raise exception 'No corrections PIN is set yet. Set one on Profile first.' using errcode = 'BBK09';
  end if;
  perform correction_pin_assert_unlocked(v_guard.locked_until);

  if p_pin is null or correction_pin_hash(v_guard.pin_salt, p_pin) <> v_guard.pin_hash then
    ok := false;
    tries_left := correction_pin_failed(p_action, p_target);
    select g.locked_until into locked_until from correction_guard g;
    return;
  end if;

  update correction_guard set failed_attempts = 0, failures_today = 0, locked_until = null;
  delete from correction_tickets where expires_at < now();
  insert into correction_tickets (action, target_id, expires_at) values (p_action, p_target, now() + interval '2 minutes');
  ok := true;
  tries_left := null;
  locked_until := null;
end;
$$;

-- Uses up a ticket for p_action on p_target, or refuses (BBK09). Called only
-- by the gated functions below; never granted.
create or replace function consume_correction_ticket(p_action text, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  delete from correction_tickets
  where id = (
    select id from correction_tickets
    where action = p_action and target_id = p_target and expires_at >= now()
    order by expires_at
    limit 1
    for update skip locked
  )
  returning true into v_found;
  if v_found is null then
    raise exception 'Confirm this correction with your corrections PIN' using errcode = 'BBK09';
  end if;
  perform log_correction_event('correction.confirmed', correction_target_tenant(p_action, p_target),
    correction_action_label(p_action));
end;
$$;

-- ---------------------------------------------------------------------------
-- Move the originals to private.<fn>_unchecked (once).
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn record;
begin
  for v_fn in
    select * from (values
      ('correct_paid_through', 'uuid, date'),
      ('correct_rent', 'uuid, date, numeric'),
      ('correct_move_out', 'uuid, date'),
      ('create_adjustment', 'uuid, uuid, numeric, text, text, text, timestamptz, jsonb'),
      ('stop_rent_tracking', 'uuid'),
      ('move_out_tenant', 'uuid, date'),
      ('update_tenant', 'uuid, text, text, text, text, text[], date, numeric, date, date, date, numeric, text, boolean')
    ) as f(name, args)
  loop
    if to_regprocedure(format('public.%s(%s)', v_fn.name, v_fn.args)) is not null
      and to_regprocedure(format('private.%s_unchecked(%s)', v_fn.name, v_fn.args)) is null then
      execute format('alter function public.%s(%s) set schema private', v_fn.name, v_fn.args);
      execute format('alter function private.%s(%s) rename to %s_unchecked', v_fn.name, v_fn.args, v_fn.name);
    end if;
    execute format('revoke all on function private.%s_unchecked(%s) from public', v_fn.name, v_fn.args);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function private.%s_unchecked(%s) from anon, authenticated, service_role',
        v_fn.name, v_fn.args);
    end if;
  end loop;
end $$;

-- The gated functions: owner check, the ticket, then the original. Same
-- names and arguments as before, so callers don't change.

create or replace function correct_paid_through(p_tenant_id uuid, p_paid_through date)
returns date
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  perform consume_correction_ticket('paid_through', p_tenant_id);
  return private.correct_paid_through_unchecked(p_tenant_id, p_paid_through);
end;
$$;

create or replace function correct_rent(p_tenant_id uuid, p_from_month date, p_monthly_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  perform consume_correction_ticket('rent', p_tenant_id);
  perform private.correct_rent_unchecked(p_tenant_id, p_from_month, p_monthly_amount);
end;
$$;

create or replace function correct_move_out(p_tenant_id uuid, p_move_out_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  perform consume_correction_ticket('move_out_date', p_tenant_id);
  perform private.correct_move_out_unchecked(p_tenant_id, p_move_out_date);
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
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  perform consume_correction_ticket('adjustment', p_original_payment_id);
  perform private.create_adjustment_unchecked(
    p_id, p_original_payment_id, p_delta_amount, p_reason, p_owner_signature_path,
    p_token_hash, p_token_expires_at, p_allocations
  );
end;
$$;

create or replace function stop_rent_tracking(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  perform consume_correction_ticket('stop_tracking', p_tenant_id);
  perform private.stop_rent_tracking_unchecked(p_tenant_id);
end;
$$;

-- The start of last month, Asia/Kolkata (moveOutPinFrom in the app): an
-- everyday move-out may be dated from then on; earlier can drop months that
-- have ended, so it needs the PIN.
create or replace function correction_backdate_limit()
returns date
language sql
stable
as $$
  select (date_trunc('month', (now() at time zone 'Asia/Kolkata')::date) - interval '1 month')::date
$$;

create or replace function move_out_tenant(p_tenant_id uuid, p_move_out_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  if p_move_out_date < correction_backdate_limit()
    and exists (select 1 from tenants where id = p_tenant_id and status = 'active') then
    perform consume_correction_ticket('move_out', p_tenant_id);
  end if;
  perform private.move_out_tenant_unchecked(p_tenant_id, p_move_out_date);
end;
$$;

-- A rent change on a tenant that isn't a draft, from before this month
-- (Asia/Kolkata), would re-price months that have ended: that is a
-- correction, and Correct rent (with the PIN) is the tool for it. Draft
-- completion is unaffected.
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
  v_this_month date := date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)::date;
  v_month date := coalesce(date_trunc('month', p_rent_effective_month)::date, v_this_month);
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  if p_monthly_rent is not null
    and v_month < v_this_month
    and exists (select 1 from tenants where id = p_tenant_id and status <> 'draft')
    and rent_for_month(p_tenant_id, v_month) is distinct from round(p_monthly_rent, 2) then
    raise exception 'A new rent can start this month at the earliest. For an earlier month, use Correct rent.'
      using errcode = 'BBK00';
  end if;
  perform private.update_tenant_unchecked(
    p_tenant_id, p_name, p_business_name, p_phone, p_preferred_channel, p_unit_codes, p_units_effective,
    p_monthly_rent, p_rent_effective_month, p_lease_start, p_paid_through, p_deposit_amount, p_tenant_kind,
    p_rent_tracked
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: everything revoked first (Supabase grants EXECUTE on new functions
-- to everyone), then only what the owner calls.
-- ---------------------------------------------------------------------------

do $$
declare
  v_sig text;
  v_roles text := case when exists (select 1 from pg_roles where rolname = 'anon')
    then 'public, anon, authenticated, service_role' else 'public' end;
begin
  foreach v_sig in array array[
    'correction_pin_hash(text, text)',
    'correction_action_label(text)',
    'correction_target_tenant(text, uuid)',
    'log_correction_event(text, uuid, text)',
    'correction_pin_status()',
    'correction_pin_assert_unlocked(timestamptz)',
    'correction_pin_failed(text, uuid)',
    'set_correction_pin(text, text)',
    'verify_correction_pin(text, text, uuid)',
    'consume_correction_ticket(text, uuid)',
    'correction_backdate_limit()',
    'correct_paid_through(uuid, date)',
    'correct_rent(uuid, date, numeric)',
    'correct_move_out(uuid, date)',
    'create_adjustment(uuid, uuid, numeric, text, text, text, timestamptz, jsonb)',
    'stop_rent_tracking(uuid)',
    'move_out_tenant(uuid, date)',
    'update_tenant(uuid, text, text, text, text, text[], date, numeric, date, date, date, numeric, text, boolean)'
  ] loop
    execute format('revoke all on function %s from %s', v_sig, v_roles);
  end loop;
end $$;

grant execute on function correction_pin_status() to authenticated;
grant execute on function set_correction_pin(text, text) to authenticated;
grant execute on function verify_correction_pin(text, text, uuid) to authenticated;
grant execute on function correct_paid_through(uuid, date) to authenticated;
grant execute on function correct_rent(uuid, date, numeric) to authenticated;
grant execute on function correct_move_out(uuid, date) to authenticated;
grant execute on function create_adjustment(uuid, uuid, numeric, text, text, text, timestamptz, jsonb) to authenticated;
grant execute on function stop_rent_tracking(uuid) to authenticated;
grant execute on function move_out_tenant(uuid, date) to authenticated;
grant execute on function update_tenant(uuid, text, text, text, text, text[], date, numeric, date, date, date, numeric, text, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Audit text: the PIN events' labels (as 0031, plus these) and their detail
-- line (as 0036, plus the correction branch). create or replace keeps the
-- grants.
-- ---------------------------------------------------------------------------

-- As 0031, plus the corrections PIN events.
create or replace function audit_action_label(p_action text)
returns text
language sql
immutable
as $$
  select case p_action
    when 'tenant.created' then 'Tenant added'
    when 'tenant.updated' then 'Tenant details changed'
    when 'tenant.activated' then 'Draft completed, billing started'
    when 'tenant.moved_out' then 'Moved out'
    when 'billing_start.corrected' then '"Paid up to" corrected'
    when 'rent_tracking.started' then 'Rent tracking started'
    when 'rent_tracking.stopped' then 'Rent tracking turned off'
    when 'tenancy.started' then 'House added'
    when 'tenancy.ended' then 'House left'
    when 'tenancy.changed' then 'House dates changed'
    when 'tenancy.deleted' then 'House removed'
    when 'rent_rate.set' then 'Rent set'
    when 'rent_rate.changed' then 'Rent changed'
    when 'rent_rate.deleted' then 'Rent removed'
    when 'rent_period.repriced' then 'Month re-priced'
    when 'rent_period.deleted' then 'Month removed'
    when 'location.created' then 'Site added'
    when 'location.updated' then 'Site changed'
    when 'property.created' then 'Tower added'
    when 'property.updated' then 'Tower changed'
    when 'unit.created' then 'House created'
    when 'unit.updated' then 'House details changed'
    when 'document.added' then 'Document added'
    when 'document.deleted' then 'Document deleted'
    when 'profile.created' then 'Profile set up'
    when 'profile.updated' then 'Profile changed'
    when 'payment.recorded' then 'Payment recorded'
    when 'payment.acknowledged' then 'Payment acknowledged by tenant'
    when 'payment.changed' then 'Payment changed'
    when 'adjustment.recorded' then 'Correction recorded'
    when 'adjustment.acknowledged' then 'Correction acknowledged by tenant'
    when 'adjustment.changed' then 'Correction changed'
    when 'maintenance.recorded' then 'Maintenance recorded'
    when 'maintenance.updated' then 'Maintenance changed'
    when 'maintenance.voided' then 'Maintenance voided'
    when 'maintenance.house_added' then 'Maintenance: house added'
    when 'maintenance.house_removed' then 'Maintenance: house removed'
    when 'maintenance.share_changed' then 'Maintenance: share changed'
    when 'maintenance.file_added' then 'Maintenance file added'
    when 'maintenance.file_removed' then 'Maintenance file deleted'
    when 'owner.created' then 'Owner account set'
    when 'owner.updated' then 'Owner account changed'
    when 'owner.deleted' then 'Owner account removed'
    when 'message.sent' then 'Link sent to tenant'
    when 'receipt.downloaded' then 'Receipt downloaded'
    when 'auth.sign_in' then 'Signed in'
    when 'auth.sign_in_failed' then 'Failed sign-in'
    when 'auth.password_changed' then 'Password changed'
    when 'auth.signed_out' then 'Signed out'
    when 'correction_pin.setup_opened' then 'Corrections PIN setup opened'
    when 'correction_pin.set' then 'Corrections PIN set'
    when 'correction_pin.changed' then 'Corrections PIN changed'
    when 'correction_pin.failed' then 'Wrong corrections PIN'
    when 'correction_pin.locked' then 'Corrections locked: too many wrong PINs'
    when 'correction.confirmed' then 'Correction confirmed with PIN'
    else 'Change'
  end
$$;

-- As 0036, plus the corrections PIN events' detail line.
create or replace function audit_describe(p_action text, p_changes jsonb, p_context jsonb, out title text, out details text)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_snapshot boolean := split_part(p_action, '.', 2) in (
    'created', 'recorded', 'added', 'set', 'started', 'deleted',
    'house_added', 'house_removed', 'file_added', 'file_removed', 'voided'
  );
  v_lines text[] := '{}';
  v_field record;
  v_before jsonb;
  v_after jsonb;
  v_receipt text := case when jsonb_typeof(p_context -> 'receiptNo') = 'string' then 'Receipt ' || (p_context ->> 'receiptNo') end;
  v_delivered boolean := coalesce(p_context -> 'delivered', 'false'::jsonb) not in ('false'::jsonb, 'null'::jsonb, '0'::jsonb, '""'::jsonb);
begin
  for v_field in
    select f.col, f.label, f.format
    from (values
      (1.0, 'name', 'Name', 'text'),
      (2.0, 'business_name', 'Business', 'text'),
      (3.0, 'phone', 'Phone', 'text'),
      (4.0, 'preferred_channel', 'Messages by', 'channel'),
      (5.0, 'status', 'Status', 'status'),
      (6.0, 'tenant_kind', 'Tenant type', 'kind'),
      (7.0, 'rent_tracked', 'Rent tracked here', 'yesNo'),
      (8.0, 'lease_start', 'Lease start', 'date'),
      (9.0, 'billing_start', 'Billing from', 'month'),
      (10.0, 'moved_out_on', 'Moved out on', 'date'),
      (11.0, 'deposit_amount', 'Deposit', 'money'),
      (11.5, 'description', 'For', 'text'),
      (11.6, 'category', 'Category', 'category'),
      (11.7, 'expense_date', 'Spent on', 'date'),
      (12.0, 'unit_code', 'House', 'text'),
      (13.0, 'start_date', 'From', 'date'),
      (14.0, 'end_date', 'Until', 'date'),
      (15.0, 'effective_month', 'From month', 'month'),
      (16.0, 'monthly_amount', 'Monthly rent', 'money'),
      (17.0, 'period_month', 'Month', 'month'),
      (18.0, 'amount_due', 'Rent due', 'money'),
      (19.0, 'receipt_no', 'Receipt', 'text'),
      (20.0, 'amount', 'Amount', 'money'),
      (20.5, 'share_amount', 'Share', 'money'),
      (21.0, 'delta_amount', 'Change', 'money'),
      (22.0, 'payment_date', 'Paid on', 'date'),
      (23.0, 'mode', 'Mode', 'mode'),
      (23.5, 'vendor', 'Paid to', 'text'),
      (24.0, 'reason', 'Reason', 'text'),
      (24.5, 'void_reason', 'Reason', 'text'),
      (25.0, 'note', 'Note', 'text'),
      (26.0, 'acknowledged_at', 'Acknowledged', 'datetime'),
      (27.0, 'address', 'Address', 'text'),
      (28.0, 'location_code', 'Site', 'text'),
      (29.0, 'property_code', 'Tower', 'text'),
      (30.0, 'floor', 'Floor', 'floor'),
      (31.0, 'unit_type', 'Type', 'unitType'),
      (32.0, 'label', 'Label', 'text'),
      (33.0, 'is_active', 'In use', 'yesNo'),
      (33.5, 'base_rent', 'House rent', 'money'),
      (34.0, 'document_type', 'Type', 'text'),
      (35.0, 'file_name', 'File', 'text'),
      (36.0, 'size_bytes', 'Size', 'bytes'),
      (37.0, 'first_name', 'First name', 'text'),
      (38.0, 'last_name', 'Last name', 'text'),
      (39.0, 'signature_name', 'Signs as', 'text'),
      (40.0, 'signature_path', 'Saved signature', 'presence'),
      (41.0, 'user_id', 'Account', 'presence')
    ) as f(ord, col, label, format)
    where p_changes ? f.col
    order by f.ord
  loop
    v_before := p_changes -> v_field.col -> 0;
    v_after := p_changes -> v_field.col -> 1;
    v_lines := v_lines || case
      when v_field.format = 'presence' then
        v_field.label || case
          when v_before is null or jsonb_typeof(v_before) = 'null' then ' added'
          when v_after is null or jsonb_typeof(v_after) = 'null' then ' removed'
          else ' replaced'
        end
      when v_snapshot then
        v_field.label || ': ' || audit_value(
          case when v_after is null or jsonb_typeof(v_after) = 'null' then v_before else v_after end,
          v_field.format
        )
      else
        v_field.label || ': ' || audit_value(v_before, v_field.format) || ' → ' || audit_value(v_after, v_field.format)
    end;
  end loop;

  -- App events explain themselves through their context.
  if p_action = 'message.sent' then
    v_lines := v_lines || (
      coalesce(case p_context ->> 'channel' when 'whatsapp' then 'WhatsApp' when 'sms' then 'SMS' when 'both' then 'WhatsApp + SMS' end, 'Message')
      || ' · ' || case when v_delivered then 'delivered' else 'not delivered' end
    );
    if v_receipt is not null then v_lines := v_lines || v_receipt; end if;
  elsif p_action = 'receipt.downloaded' then
    if v_receipt is not null then v_lines := v_lines || v_receipt; end if;
  elsif p_action like 'auth.%' then
    if p_context ->> 'method' = 'password' then v_lines := v_lines || 'Password'::text;
    elsif p_context ->> 'method' = 'email_link' then v_lines := v_lines || 'Email link'::text;
    end if;
    if p_context ->> 'reason' = 'not_owner' then v_lines := v_lines || 'The account isn''t the owner''s'::text;
    elsif p_context -> 'knownEmail' = 'false'::jsonb then v_lines := v_lines || 'Not an owner email'::text;
    elsif p_context ->> 'reason' = 'wrong_password' then v_lines := v_lines || 'Wrong password'::text;
    end if;
  elsif p_action like 'correction%' and jsonb_typeof(p_context -> 'detail') = 'string' then
    -- 0039: which correction, or how long corrections are locked.
    v_lines := v_lines || (p_context ->> 'detail');
  end if;

  title := case
    when p_action = 'message.sent' and not v_delivered then 'Link not delivered to tenant'
    else audit_action_label(p_action)
  end;
  details := array_to_string(v_lines, ' · ');
end;
$$;

commit;
