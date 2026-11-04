-- Maintenance expenses (D35 in docs/database-design.md).
--
-- What the owner spends on the houses: a plumber, a coat of paint, the
-- society's common charges, property tax. Recorded against one house, or
-- against several with the cost split equally, so every house carries its
-- own share and per-house / per-tower figures (net earning, cost per house)
-- are a sum, never a guess.
--
--   maintenance_expenses        one row per expense (date, amount, category,
--                               what for, paid to, note), voidable
--   maintenance_expense_units   the houses it covers and each one's share
--   maintenance_expense_tags    who paid it: each expense's own copy of the
--                               names, as payments copy theirs (D34); the
--                               suggestions are the shared payment_tags list
--   maintenance_files           receipts, bills, photos
--
-- Unlike the rent ledger (append-only, D4) an expense is the owner's own
-- bookkeeping, so a mistake is edited, or the whole record is voided (kept,
-- left out of every total). Every change is in the audit log. The expense
-- and its houses change only through the functions below (the split must
-- always add up to the amount); tags and files are plain owner writes under
-- RLS, written by the app in the same transaction as the expense.

-- 1. Tables -------------------------------------------------------------------

create table maintenance_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  category text not null check (category in (
    'plumbing', 'electrical', 'painting', 'carpentry', 'civil_repair', 'appliance',
    'cleaning', 'utilities', 'society_charges', 'property_tax', 'other'
  )),
  description text not null check (description = btrim(description) and char_length(description) between 1 and 120),
  vendor text check (vendor = btrim(vendor) and char_length(vendor) between 1 and 80),
  note text check (char_length(note) <= 500),
  voided_at timestamptz,
  void_reason text check (void_reason = btrim(void_reason) and char_length(void_reason) between 1 and 200),
  recorded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_expenses_void_reason check ((voided_at is null) = (void_reason is null))
);

-- The list's default order (newest first).
create index maintenance_expenses_date_idx on maintenance_expenses (expense_date desc, id);

comment on table maintenance_expenses is
  'Money the owner spent on the houses (D35). Edited or voided (kept, out of totals) through the SQL functions only.';
comment on column maintenance_expenses.vendor is 'Who the money went to (plumber, society, municipality...), optional.';
comment on column maintenance_expenses.voided_at is 'Set once by void_maintenance_expense; a voided expense counts nowhere.';

create trigger maintenance_expenses_updated_at before update on maintenance_expenses
  for each row execute function set_updated_at();
create trigger maintenance_expenses_recorded_by_frozen before update on maintenance_expenses
  for each row execute function prevent_key_change('recorded_by');

create table maintenance_expense_units (
  expense_id uuid not null references maintenance_expenses (id) on update restrict on delete restrict,
  unit_code text not null references units (unit_code) on update restrict on delete restrict,
  share_amount numeric(12, 2) not null check (share_amount >= 0),
  primary key (expense_id, unit_code)
);

-- A house's (and so a tower's) expenses.
create index maintenance_expense_units_unit_idx on maintenance_expense_units (unit_code);

comment on table maintenance_expense_units is
  'The houses an expense covers and each one''s share: the amount split equally, the odd paise to the first houses by code.';

create table maintenance_expense_tags (
  expense_id uuid not null references maintenance_expenses (id) on update restrict on delete restrict,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (expense_id, name)
);

create unique index maintenance_expense_tags_name_key on maintenance_expense_tags (expense_id, lower(name));

comment on table maintenance_expense_tags is
  'Who paid an expense, each a copy of the name (suggestions: payment_tags); added and removed by the owner, never updated.';

create table maintenance_files (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references maintenance_expenses (id) on update restrict on delete restrict,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  content_type text not null check (
    content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')
  ),
  size_bytes integer not null check (size_bytes > 0),
  recorded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  -- The file must live in this expense's own folder.
  constraint maintenance_files_path_in_folder
    check (storage_path like 'maintenance/' || expense_id || '/files/_%')
);

create index maintenance_files_expense_idx on maintenance_files (expense_id, created_at);

comment on table maintenance_files is
  'Receipts, bills and photos on an expense, under maintenance/<expense_id>/files/. Owner may add or delete; never edited.';

-- 2. Access -------------------------------------------------------------------

alter table maintenance_expenses enable row level security;
alter table maintenance_expense_units enable row level security;
alter table maintenance_expense_tags enable row level security;
alter table maintenance_files enable row level security;

create policy "owner reads maintenance expenses" on maintenance_expenses
  for select to authenticated using (is_app_owner());
create policy "owner reads maintenance houses" on maintenance_expense_units
  for select to authenticated using (is_app_owner());

create policy "owner reads maintenance tags" on maintenance_expense_tags
  for select to authenticated using (is_app_owner());
create policy "owner adds maintenance tags" on maintenance_expense_tags
  for insert to authenticated with check (is_app_owner());
create policy "owner removes maintenance tags" on maintenance_expense_tags
  for delete to authenticated using (is_app_owner());

create policy "owner reads maintenance files" on maintenance_files
  for select to authenticated using (is_app_owner());
create policy "owner adds maintenance files" on maintenance_files
  for insert to authenticated with check (is_app_owner());
create policy "owner deletes maintenance files" on maintenance_files
  for delete to authenticated using (is_app_owner());

revoke all on maintenance_expenses, maintenance_expense_units, maintenance_expense_tags, maintenance_files from anon;
-- The expense and its split change only through the functions below.
revoke insert, update, delete, truncate on maintenance_expenses, maintenance_expense_units from authenticated;
revoke update, truncate on maintenance_expense_tags, maintenance_files from authenticated;

-- 3. Writes -------------------------------------------------------------------

-- The amount split equally over the houses: everyone gets the same whole
-- paise, the paise left over go one each to the first houses by code, so
-- the shares always add up to the amount. src/lib/domain/maintenance.ts
-- (splitEqually) is the same rule for the form's preview.
create function maintenance_shares(p_amount numeric, p_unit_codes text[])
returns table (unit_code text, share_amount numeric)
language sql
immutable
as $$
  with houses as (
    select c, row_number() over (order by c) as i, count(*) over () as n
    from (select distinct c from unnest(p_unit_codes) as c) d
  ),
  paise as (select round(p_amount * 100)::bigint as total)
  select h.c,
    ((paise.total / h.n) + case when h.i <= paise.total % h.n then 1 else 0 end)::numeric / 100
  from houses h, paise
  order by h.c
$$;

-- The houses an expense may cover: at least one, each once, all existing and
-- in use - except one it already covers (p_kept), which may since have been
-- retired.
create function assert_maintenance_units(p_unit_codes text[], p_kept text[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v_missing text;
begin
  if coalesce(cardinality(p_unit_codes), 0) = 0 then
    raise exception 'Choose at least one house' using errcode = 'BBK00';
  end if;
  if cardinality(p_unit_codes) > 200 then
    raise exception 'Choose at most 200 houses' using errcode = 'BBK00';
  end if;
  if (select count(distinct c) from unnest(p_unit_codes) as c) <> cardinality(p_unit_codes) then
    raise exception 'Each house can only be chosen once' using errcode = 'BBK00';
  end if;
  select string_agg(c, ', ' order by c) into v_missing
  from unnest(p_unit_codes) as c
  where not exists (
    select 1 from units u where u.unit_code = c and (u.is_active or c = any (coalesce(p_kept, '{}')))
  );
  if v_missing is not null then
    raise exception 'House not found or no longer in use: %', v_missing using errcode = 'BBK00';
  end if;
end;
$$;

create function create_maintenance_expense(
  p_id uuid,
  p_expense_date date,
  p_amount numeric,
  p_category text,
  p_description text,
  p_vendor text,
  p_note text,
  p_unit_codes text[]
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
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'The amount must be more than zero' using errcode = 'BBK00';
  end if;
  perform assert_maintenance_units(p_unit_codes, null);

  insert into maintenance_expenses (id, expense_date, amount, category, description, vendor, note)
  values (p_id, p_expense_date, round(p_amount, 2), p_category, p_description, p_vendor, p_note);

  insert into maintenance_expense_units (expense_id, unit_code, share_amount)
  select p_id, s.unit_code, s.share_amount from maintenance_shares(round(p_amount, 2), p_unit_codes) s;
end;
$$;

-- Changes every field and the houses; the split is redone. Only the houses
-- that change are written, so the history shows just those.
create function update_maintenance_expense(
  p_id uuid,
  p_expense_date date,
  p_amount numeric,
  p_category text,
  p_description text,
  p_vendor text,
  p_note text,
  p_unit_codes text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense maintenance_expenses;
  v_kept text[];
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  select * into v_expense from maintenance_expenses where id = p_id for update;
  if not found then
    raise exception 'Expense not found' using errcode = 'BBK04';
  end if;
  if v_expense.voided_at is not null then
    raise exception 'This expense was voided and can''t be changed' using errcode = 'BBK09';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'The amount must be more than zero' using errcode = 'BBK00';
  end if;
  select coalesce(array_agg(unit_code), '{}') into v_kept from maintenance_expense_units where expense_id = p_id;
  perform assert_maintenance_units(p_unit_codes, v_kept);

  update maintenance_expenses
  set expense_date = p_expense_date,
      amount = round(p_amount, 2),
      category = p_category,
      description = p_description,
      vendor = p_vendor,
      note = p_note
  where id = p_id;

  delete from maintenance_expense_units
  where expense_id = p_id and unit_code <> all (p_unit_codes);

  insert into maintenance_expense_units (expense_id, unit_code, share_amount)
  select p_id, s.unit_code, s.share_amount from maintenance_shares(round(p_amount, 2), p_unit_codes) s
  on conflict (expense_id, unit_code) do update
    set share_amount = excluded.share_amount
    where maintenance_expense_units.share_amount is distinct from excluded.share_amount;
end;
$$;

create function void_maintenance_expense(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  update maintenance_expenses set voided_at = now(), void_reason = p_reason
  where id = p_id and voided_at is null;
  if not found then
    if exists (select 1 from maintenance_expenses where id = p_id) then
      raise exception 'This expense is already voided' using errcode = 'BBK09';
    end if;
    raise exception 'Expense not found' using errcode = 'BBK04';
  end if;
end;
$$;

-- 4. Audit --------------------------------------------------------------------

-- An expense's own history (its detail page).
create index audit_log_entity_idx on audit_log (entity_type, entity_id, id desc) where entity_id is not null;

-- As 0016, plus the maintenance actions; an expense's houses and files are
-- logged under the expense (entity_id), and a house row's unit_code puts it
-- in that house's and tower's history.
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
    'pdf_path', 'otp_verified_at', 'storage_path', 'house_number', 'tower_code', 'expense_id'
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
    when tg_table_name = 'maintenance_expenses' then
      case
        when tg_op = 'INSERT' then 'maintenance.recorded'
        when v_changes ? 'voided_at' then 'maintenance.voided'
        else 'maintenance.updated'
      end
    when tg_table_name = 'maintenance_expense_units' then
      case tg_op when 'INSERT' then 'maintenance.house_added' when 'DELETE' then 'maintenance.house_removed' else 'maintenance.share_changed' end
    when tg_table_name = 'maintenance_files' then
      case tg_op when 'INSERT' then 'maintenance.file_added' else 'maintenance.file_removed' end
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
    case
      when tg_table_name like 'maintenance\_%' then coalesce(v_row ->> 'expense_id', v_row ->> 'id')
      else coalesce(v_row ->> 'id', v_row ->> 'unit_code', v_row ->> 'property_code', v_row ->> 'location_code')
    end,
    case when tg_table_name = 'tenants' then (v_row ->> 'id')::uuid else (v_row ->> 'tenant_id')::uuid end,
    v_unit,
    v_property,
    v_changes
  );
  return null;
end;
$$;

create trigger maintenance_expenses_audit after insert or update on maintenance_expenses
  for each row execute function audit_row_change('maintenance');
create trigger maintenance_expense_units_audit after insert or update or delete on maintenance_expense_units
  for each row execute function audit_row_change('maintenance');
create trigger maintenance_files_audit after insert or delete on maintenance_files
  for each row execute function audit_row_change('maintenance');

-- As 0017, plus the expense categories. Labels match src/lib/domain
-- (maintenance.ts); test/schema.test.ts checks they stay equal.
create or replace function audit_value(p_value jsonb, p_format text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_type text := jsonb_typeof(p_value);
  v_text text := p_value #>> '{}';
begin
  if p_value is null or v_type = 'null' or v_text = '' then
    return '—';
  end if;
  return case p_format
    when 'money' then case when v_type in ('number', 'string') then audit_money(v_text::numeric) else '—' end
    when 'date' then case when v_type = 'string' then audit_date(left(v_text, 10)::date) else '—' end
    when 'month' then case when v_type = 'string' then audit_month(left(v_text, 10)::date) else '—' end
    when 'datetime' then case when v_type = 'string' then audit_datetime(v_text::timestamptz) else '—' end
    when 'status' then case v_text when 'active' then 'Active' when 'draft' then 'Draft' when 'inactive' then 'Moved out' else '—' end
    when 'kind' then case v_text when 'individual' then 'Individual' when 'business' then 'Business' when 'government' then 'Government' else '—' end
    when 'channel' then case v_text when 'both' then 'WhatsApp + SMS' when 'whatsapp' then 'WhatsApp only' when 'sms' then 'SMS only' else '—' end
    when 'unitType' then case v_text when 'residential' then 'Residential' when 'commercial' then 'Commercial' else '—' end
    when 'floor' then case
      when v_type <> 'string' then '—'
      when v_text = 'G' then 'Ground floor'
      when v_text = 'B' then 'Basement'
      when v_text like 'B%' then 'Basement ' || substr(v_text, 2)
      else 'Floor ' || v_text
    end
    when 'mode' then case v_text
      when 'cash' then 'Cash' when 'bank_transfer' then 'Bank transfer' when 'upi' then 'UPI' when 'cheque' then 'Cheque'
      else 'Other'
    end
    when 'category' then case v_text
      when 'plumbing' then 'Plumbing'
      when 'electrical' then 'Electrical'
      when 'painting' then 'Painting'
      when 'carpentry' then 'Carpentry'
      when 'civil_repair' then 'Civil & masonry'
      when 'appliance' then 'Appliances'
      when 'cleaning' then 'Cleaning'
      when 'utilities' then 'Water & electricity bills'
      when 'society_charges' then 'Society / common charges'
      when 'property_tax' then 'Property tax'
      else 'Other'
    end
    when 'yesNo' then case when p_value = 'true'::jsonb then 'Yes' else 'No' end
    when 'bytes' then case when v_type = 'number' then greatest(1, round(v_text::numeric / 1024))::int || ' KB' else '—' end
    when 'presence' then 'set'
    else v_text
  end;
end;
$$;

-- As 0017, plus the maintenance actions.
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
    else 'Change'
  end
$$;

-- As 0017, plus the expense columns, and the maintenance actions that list
-- values (a house or file added or removed, a void and its reason).
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
  end if;

  title := case
    when p_action = 'message.sent' and not v_delivered then 'Link not delivered to tenant'
    else audit_action_label(p_action)
  end;
  details := array_to_string(v_lines, ' · ');
end;
$$;

-- 5. Grants -------------------------------------------------------------------
-- create or replace keeps those of audit_row_change, audit_value,
-- audit_action_label and audit_describe.

revoke all on function maintenance_shares(numeric, text[]) from public, anon, authenticated;
revoke all on function assert_maintenance_units(text[], text[]) from public, anon, authenticated;
revoke all on function create_maintenance_expense(uuid, date, numeric, text, text, text, text, text[])
  from public, anon, authenticated;
revoke all on function update_maintenance_expense(uuid, date, numeric, text, text, text, text, text[])
  from public, anon, authenticated;
revoke all on function void_maintenance_expense(uuid, text) from public, anon, authenticated;

grant execute on function create_maintenance_expense(uuid, date, numeric, text, text, text, text, text[]) to authenticated;
grant execute on function update_maintenance_expense(uuid, date, numeric, text, text, text, text, text[]) to authenticated;
grant execute on function void_maintenance_expense(uuid, text) to authenticated;
