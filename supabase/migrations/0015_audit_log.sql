-- Audit history (D25 in docs/database-design.md).
--
-- Occupancy and rent are already dated history (D7, D8) and the ledger is
-- append-only (D4), but plenty still changes in place: a tenant's name and
-- phone, a rent set twice for the same month (on conflict do update), months
-- re-priced or dropped by update_tenant / move_out_tenant /
-- correct_paid_through, a house renamed or retired, a document deleted, the
-- owner's profile. None of it said when, or who.
--
-- audit_log is one append-only table written by a trigger on every table
-- that holds vital data, so nothing can bypass it: the SQL functions, the
-- owner's direct writes under RLS and the service role all go through it.
-- Each row keeps only the columns that changed, as {column: [old, new]}.
-- Rows written by one statement or function share tx_id, so the app can
-- show e.g. a move-out and the months it dropped as one change.
--
-- App-level events (a message sent to a tenant, a receipt downloaded, a
-- sign-in) are added through log_event(). Nobody - not the owner, not the
-- service role - can edit or delete a row.
--
-- payments, adjustments, tenant documents, tenancies and rent rates also
-- get recorded_by: the account that wrote them, fixed once written.

-- 1. The log ------------------------------------------------------------------

create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- Rows written in one transaction belong to one change.
  tx_id bigint not null default txid_current(),
  actor_id uuid,
  -- owner: the signed-in owner; tenant: the confirm link; system: cron,
  -- service role, hand-run SQL; visitor: someone not signed in (a failed sign-in).
  actor_kind text not null check (actor_kind in ('owner', 'tenant', 'system', 'visitor')),
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null,
  entity_id text,
  -- Denormalised so the tenant, house and tower histories are one index scan.
  tenant_id uuid,
  unit_code text,
  property_code text,
  -- {column: [old, new]}; null old on insert, null new on delete.
  changes jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb
);

-- No foreign keys: history outlives what it describes.
create index audit_log_tenant_idx on audit_log (tenant_id, id desc) where tenant_id is not null;
create index audit_log_unit_idx on audit_log (unit_code, id desc) where unit_code is not null;
create index audit_log_property_idx on audit_log (property_code, id desc) where property_code is not null;
create index audit_log_action_idx on audit_log (action, id desc);

comment on table audit_log is
  'Append-only history of every change to vital data, plus app events (D25). Written by triggers and log_event().';

alter table audit_log enable row level security;
create policy "owner reads the audit log" on audit_log
  for select to authenticated using (is_app_owner());

revoke all on audit_log from anon;
revoke insert, update, delete, truncate on audit_log from authenticated, service_role;

create function audit_log_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'The audit log can''t be changed' using errcode = 'BBK09';
end;
$$;

-- Even the service role (which bypasses RLS) can't rewrite history.
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- 2. Who recorded it ------------------------------------------------------------

alter table payments add column recorded_by uuid references auth.users (id) on delete set null default auth.uid();
alter table adjustments add column recorded_by uuid references auth.users (id) on delete set null default auth.uid();
alter table tenant_documents add column recorded_by uuid references auth.users (id) on delete set null default auth.uid();
alter table tenant_units add column recorded_by uuid references auth.users (id) on delete set null default auth.uid();
alter table tenant_rent_rates add column recorded_by uuid references auth.users (id) on delete set null default auth.uid();

-- Only the owner could write any of these, so existing rows are theirs.
update payments set recorded_by = (select user_id from app_owner);
update adjustments set recorded_by = (select user_id from app_owner);
update tenant_documents set recorded_by = (select user_id from app_owner);
update tenant_units set recorded_by = (select user_id from app_owner);
update tenant_rent_rates set recorded_by = (select user_id from app_owner);

create trigger payments_recorded_by_frozen before update on payments
  for each row execute function prevent_key_change('recorded_by');
create trigger adjustments_recorded_by_frozen before update on adjustments
  for each row execute function prevent_key_change('recorded_by');
create trigger tenant_units_recorded_by_frozen before update on tenant_units
  for each row execute function prevent_key_change('recorded_by');
create trigger tenant_rent_rates_recorded_by_frozen before update on tenant_rent_rates
  for each row execute function prevent_key_change('recorded_by');
-- tenant_documents are never updated (UPDATE revoked, 0011).

-- 3. The row trigger ------------------------------------------------------------

create function audit_row_change()
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

create trigger tenants_audit after insert or update on tenants
  for each row execute function audit_row_change('tenant');
create trigger tenant_units_audit after insert or update or delete on tenant_units
  for each row execute function audit_row_change('tenancy');
create trigger tenant_rent_rates_audit after insert or update or delete on tenant_rent_rates
  for each row execute function audit_row_change('rent_rate');
-- New months are routine (ensure_rent_periods); a re-priced or dropped one isn't.
create trigger rent_periods_audit after update of amount_due or delete on rent_periods
  for each row execute function audit_row_change('rent_period');
create trigger locations_audit after insert or update on locations
  for each row execute function audit_row_change('location');
create trigger properties_audit after insert or update on properties
  for each row execute function audit_row_change('property');
create trigger units_audit after insert or update on units
  for each row execute function audit_row_change('unit');
create trigger tenant_documents_audit after insert or delete on tenant_documents
  for each row execute function audit_row_change('document');
create trigger owner_profile_audit after insert or update on owner_profile
  for each row execute function audit_row_change('profile');
create trigger payments_audit after insert or update on payments
  for each row execute function audit_row_change('payment');
create trigger adjustments_audit after insert or update on adjustments
  for each row execute function audit_row_change('adjustment');
create trigger app_owner_audit after insert or update or delete on app_owner
  for each row execute function audit_row_change('owner');

-- 4. App events ---------------------------------------------------------------

-- The owner logs their own events; the service role (no signed-in user) logs
-- the tenant's and failed sign-ins, naming the actor. Only app-level actions:
-- table changes are the trigger's alone.
create function log_event(
  p_action text,
  p_tenant_id uuid default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_context jsonb default '{}'::jsonb,
  p_actor_kind text default null,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_actor uuid;
begin
  if p_action not in (
    'message.sent', 'receipt.downloaded',
    'auth.sign_in', 'auth.sign_in_failed', 'auth.password_changed', 'auth.signed_out'
  ) then
    raise exception 'Unknown event %', p_action using errcode = 'BBK00';
  end if;

  if is_app_owner() then
    v_kind := 'owner';
    v_actor := auth.uid();
  elsif auth.uid() is not null then
    raise exception 'Not allowed' using errcode = 'BBK04';
  else
    v_kind := coalesce(p_actor_kind, 'system');
    v_actor := p_actor_id;
  end if;

  insert into audit_log (actor_id, actor_kind, action, entity_type, entity_id, tenant_id, context)
  values (
    v_actor,
    v_kind,
    p_action,
    coalesce(p_entity_type, split_part(p_action, '.', 1)),
    p_entity_id,
    p_tenant_id,
    coalesce(p_context, '{}'::jsonb)
  );
end;
$$;

revoke all on function audit_log_immutable() from public, anon, authenticated;
revoke all on function audit_row_change() from public, anon, authenticated;
revoke all on function log_event(text, uuid, text, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function log_event(text, uuid, text, text, jsonb, text, uuid) to authenticated, service_role;
