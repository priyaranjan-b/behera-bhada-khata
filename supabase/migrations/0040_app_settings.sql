-- App settings (D42 in docs/database-design.md, A36): one row of
-- rent-book-wide preferences, so far only how the app shows dates.
--
-- date_format is a display preference of the UI only: no SQL function,
-- service, stored audit text or PDF receipt uses it - they keep DD/MM/YYYY
-- (DATE_FORMAT in src/lib/dates.ts, audit_date in 0017). The values are dayjs
-- tokens, DISPLAY_DATE_FORMATS in src/lib/types.ts; no row = the default.
-- The tenant portal reads it too, so tenants see dates the same way.
-- Safe to run again.

create table if not exists app_settings (
  singleton boolean primary key default true check (singleton),
  date_format text not null default 'DD/MMM/YYYY'
    check (date_format in ('DD/MMM/YYYY', 'DD/MM/YYYY', 'DD MMM YYYY', 'YYYY-MM-DD')),
  updated_at timestamptz not null default now()
);

comment on table app_settings is
  'Rent-book-wide preferences, one row (D42). date_format: how the UI shows dates (dayjs tokens); nothing else uses it.';

alter table app_settings enable row level security;

drop policy if exists "owner reads settings" on app_settings;
create policy "owner reads settings" on app_settings for select to authenticated using (is_app_owner());
drop policy if exists "owner creates settings" on app_settings;
create policy "owner creates settings" on app_settings for insert to authenticated with check (is_app_owner());
drop policy if exists "owner changes settings" on app_settings;
create policy "owner changes settings" on app_settings
  for update to authenticated using (is_app_owner()) with check (is_app_owner());

revoke all on app_settings from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on app_settings from anon, authenticated, service_role';
    execute 'grant select, insert, update on app_settings to authenticated';
    execute 'grant select on app_settings to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'tenant_reader') then
    execute 'grant select on app_settings to tenant_reader';
    execute 'drop policy if exists "tenants read settings" on app_settings';
    execute 'create policy "tenants read settings" on app_settings for select to tenant_reader using (true)';
  end if;
end $$;

drop trigger if exists app_settings_updated_at on app_settings;
create trigger app_settings_updated_at before update on app_settings
  for each row execute function set_updated_at();

-- Audited as "Settings changed - Date format: DD/MM/YYYY -> DD/MMM/YYYY".
drop trigger if exists app_settings_audit on app_settings;
create trigger app_settings_audit after insert or update on app_settings
  for each row execute function audit_row_change('settings');

-- As 0039, plus the settings actions. create or replace keeps the grants.
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
    when 'settings.created' then 'Settings changed'
    when 'settings.updated' then 'Settings changed'
    else 'Change'
  end
$$;

-- As 0039, plus the date_format column.
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
      (41.0, 'user_id', 'Account', 'presence'),
      (42.0, 'date_format', 'Date format', 'text')
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
