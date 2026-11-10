-- House rent (D39 in docs/database-design.md).
--
-- Rent is billed per tenant: one combined rent covers all of a tenant's
-- houses, priced by tenant_rent_rates. A house had no rent of its own, so
-- once it was vacant the owner couldn't see what it last went for.
-- units.base_rent is that figure: master data, set whenever a tenant's rent
-- is set (split across their houses, adding up to the tenant's rent) and
-- editable by hand on the Houses page. It never prices a rent month and
-- nothing reads it for money; moving out leaves it as it was.
-- Safe to run again: the backfill fills only houses with no rent yet.

alter table units add column if not exists base_rent numeric(12, 2) check (base_rent is null or base_rent > 0);

comment on column units.base_rent is
  'House rent: what the house goes for (its last tenant''s rent, or their share of it). Never prices a rent month (D39).';

-- The tenant portal (D37) reads the houses a tenant ever held, so a former
-- tenant would see what the house goes for now: tenant_reader gets every
-- column but the house rent (as 0034 did for recorded_by). A column added
-- to units later stays hidden from tenants until a migration grants it.
revoke select on units from tenant_reader;
grant select (unit_code, property_code, house_number, floor, unit_type, label, is_active, created_at, updated_at)
  on units to tenant_reader;

-- As 0031, plus the house rent. create or replace keeps its grants.
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
  end if;

  title := case
    when p_action = 'message.sent' and not v_delivered then 'Link not delivered to tenant'
    else audit_action_label(p_action)
  end;
  details := array_to_string(v_lines, ' · ');
end;
$$;

-- Backfill (after audit_describe, so its history rows read "House rent: ..."):
-- each house's latest tenancy. A current tenant's latest rate, a
-- past one's rate in their last month; split equally over the houses the
-- tenant held on that day (maintenance_shares, the odd paise to the first
-- houses by code). A house never let stays empty.
with latest as (
  select distinct on (tu.unit_code)
    tu.unit_code,
    tu.tenant_id,
    tu.end_date is null or tu.end_date >= (now() at time zone 'Asia/Kolkata')::date as is_current,
    greatest(tu.start_date, least(coalesce(tu.end_date, (now() at time zone 'Asia/Kolkata')::date),
      (now() at time zone 'Asia/Kolkata')::date)) as as_of
  from tenant_units tu
  order by tu.unit_code, tu.start_date desc
),
priced as (
  select l.*,
    coalesce(
      case when not l.is_current then rent_for_month(l.tenant_id, date_trunc('month', l.as_of)::date) end,
      (select r.monthly_amount from tenant_rent_rates r where r.tenant_id = l.tenant_id order by r.effective_month desc limit 1)
    ) as rent,
    (select array_agg(h.unit_code) from tenant_units h
      where h.tenant_id = l.tenant_id and h.start_date <= l.as_of and (h.end_date is null or h.end_date >= l.as_of)) as held
  from latest l
)
update units u
set base_rent = s.share_amount
from priced p
cross join lateral maintenance_shares(p.rent, p.held) s
where p.rent is not null
  and s.unit_code = p.unit_code
  and u.unit_code = p.unit_code
  and u.base_rent is null
  and s.share_amount > 0;
