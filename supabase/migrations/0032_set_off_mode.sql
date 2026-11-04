-- Set-off payments (A22 in docs/design-decisions.md).
--
-- A tenant sometimes keeps back money the owner owes them (goods the owner
-- bought from their shop) and pays the rest of the rent in cash. The part
-- kept back still pays the rent, so it is a payment like any other - it
-- allocates to rent months through create_payment and reduces arrears - but
-- no money came in. Its own mode, 'set_off', lets the app leave it out of
-- every cash figure ("Received") and say so on the receipt. Unlike an
-- adjustment (a correction of a wrong payment, D4), nothing was wrong.

alter table payments drop constraint payments_mode_check;
alter table payments add constraint payments_mode_check
  check (mode in ('cash', 'bank_transfer', 'upi', 'cheque', 'other', 'set_off'));

-- As 0031, plus the set-off label. Labels match src/lib/domain (payments.ts,
-- maintenance.ts); test/schema.test.ts checks they stay equal. create or
-- replace keeps its grants.
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
      when 'set_off' then 'Set-off (deducted by tenant)'
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

-- A maintenance expense paid by a set-off (A22) --------------------------------
--
-- When what the tenant kept back paid for something used on the houses (paint
-- bought from their shop), the owner records it as a maintenance expense too.
-- No cash went out for it, just as none came in for the set-off, so a cash
-- figure (Net cash = cash received - cash spent) must leave it out or it is
-- subtracted twice. The expense keeps the set-off payment that settled it.

alter table maintenance_expenses
  add column settled_by_payment_id uuid references payments (id) on update restrict on delete restrict;

comment on column maintenance_expenses.settled_by_payment_id is
  'The set-off payment (mode set_off) that paid for it: no cash went out (A22). Set when recorded, never changed.';

-- One live expense per set-off; a voided one frees it.
create unique index maintenance_expenses_settled_by_key on maintenance_expenses (settled_by_payment_id)
  where settled_by_payment_id is not null and voided_at is null;

create trigger maintenance_expenses_settled_by_frozen before update on maintenance_expenses
  for each row execute function prevent_key_change('settled_by_payment_id');

-- As 0031, plus p_settled_by_payment_id: a set-off payment, for no more than its amount.
drop function create_maintenance_expense(uuid, date, numeric, text, text, text, text, text[]);

create function create_maintenance_expense(
  p_id uuid,
  p_expense_date date,
  p_amount numeric,
  p_category text,
  p_description text,
  p_vendor text,
  p_note text,
  p_unit_codes text[],
  p_settled_by_payment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment payments;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'The amount must be more than zero' using errcode = 'BBK00';
  end if;
  perform assert_maintenance_units(p_unit_codes, null);
  if p_settled_by_payment_id is not null then
    -- Locked: a second save for the same set-off (a double click) waits here,
    -- then gets the BBK09 below rather than the unique index's 23505.
    select * into v_payment from payments where id = p_settled_by_payment_id for update;
    if not found or v_payment.mode <> 'set_off' then
      raise exception 'Only a set-off payment can pay for an expense' using errcode = 'BBK00';
    end if;
    if round(p_amount, 2) > v_payment.amount then
      raise exception 'The expense can''t be more than the set-off (%)', v_payment.amount using errcode = 'BBK00';
    end if;
    if exists (
      select 1 from maintenance_expenses
      where settled_by_payment_id = p_settled_by_payment_id and voided_at is null
    ) then
      raise exception 'That set-off is already recorded as an expense' using errcode = 'BBK09';
    end if;
  end if;

  insert into maintenance_expenses (id, expense_date, amount, category, description, vendor, note, settled_by_payment_id)
  values (p_id, p_expense_date, round(p_amount, 2), p_category, p_description, p_vendor, p_note, p_settled_by_payment_id);

  insert into maintenance_expense_units (expense_id, unit_code, share_amount)
  select p_id, s.unit_code, s.share_amount from maintenance_shares(round(p_amount, 2), p_unit_codes) s;
end;
$$;

revoke all on function create_maintenance_expense(uuid, date, numeric, text, text, text, text, text[], uuid)
  from public, anon, authenticated;
grant execute on function create_maintenance_expense(uuid, date, numeric, text, text, text, text, text[], uuid) to authenticated;

-- As 0031, plus: an expense a set-off paid for stays within the set-off's
-- amount when edited. Same signature, so its grants stay.
create or replace function update_maintenance_expense(
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
  -- Paid by a set-off (A22): still no more than it, or the excess would count as never paid in cash.
  if v_expense.settled_by_payment_id is not null and round(p_amount, 2) > (
    select amount from payments where id = v_expense.settled_by_payment_id
  ) then
    raise exception 'The expense can''t be more than the set-off that paid for it' using errcode = 'BBK00';
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
