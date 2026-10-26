-- Stored audit text (D27 in docs/database-design.md).
--
-- Until now audit_log held only the raw diff ({column: [old, new]}) and the
-- app built the readable text ("Rent changed", "Monthly rent: ₹6,000.00 →
-- ₹6,500.00") on every read. So the history couldn't be searched, sorted or
-- paged in SQL. Each row now stores what the history shows, written once
-- when the row is inserted:
--   title       "Rent changed"
--   details     "Monthly rent: ₹6,000.00 → ₹6,500.00" (lines joined with " · ")
--   actor_name  the owner's name, or Tenant / System / Not signed in
-- It's a snapshot: a label or a name changed later doesn't rewrite history.
--
-- A BEFORE INSERT trigger fills them, so both writers (audit_row_change and
-- log_event) are unchanged. Existing rows are backfilled below.
--
-- tenant_history_page() is the tenant page's Change history table: one page,
-- searched, filtered and sorted on those columns (A14).

-- 1. Formatting: the same text the app shows (APP_LOCALE en-IN, Asia/Kolkata)

-- ₹ with Indian grouping and two decimals: ₹12,34,567.50, ₹-500.00.
create function audit_money(p_amount numeric)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_abs numeric := round(abs(p_amount), 2);
  v_int text := trunc(v_abs)::text;
  v_frac text := lpad(((v_abs - trunc(v_abs)) * 100)::int::text, 2, '0');
begin
  if length(v_int) > 3 then
    v_int := regexp_replace(left(v_int, length(v_int) - 3), '(\d)(?=(\d\d)+$)', '\1,', 'g') || ',' || right(v_int, 3);
  end if;
  return '₹' || case when p_amount < 0 then '-' else '' end || v_int || '.' || v_frac;
end;
$$;

-- en-IN short months ("Sept", not "Sep").
create function audit_short_month(p_date date)
returns text
language sql
immutable
as $$
  select (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'])[extract(month from p_date)::int]
$$;

-- 5 Mar 2026
create function audit_date(p_date date)
returns text
language sql
immutable
set search_path = public
as $$
  select extract(day from p_date)::int || ' ' || audit_short_month(p_date) || ' ' || extract(year from p_date)::int
$$;

-- March 2026
create function audit_month(p_date date)
returns text
language sql
immutable
as $$
  select to_char(p_date, 'FMMonth YYYY')
$$;

-- 26 Oct 2026, 6:50 pm IST
create function audit_datetime(p_at timestamptz)
returns text
language sql
immutable
set search_path = public
as $$
  select audit_date((p_at at time zone 'Asia/Kolkata')::date) || ', '
    || to_char(p_at at time zone 'Asia/Kolkata', 'FMHH12:MI am') || ' IST'
$$;

-- One value of a changed column, by format. Labels match src/lib/domain
-- (tenant.ts, payments.ts); test/schema.test.ts checks they stay equal.
create function audit_value(p_value jsonb, p_format text)
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
    when 'yesNo' then case when p_value = 'true'::jsonb then 'Yes' else 'No' end
    when 'bytes' then case when v_type = 'number' then greatest(1, round(v_text::numeric / 1024))::int || ' KB' else '—' end
    when 'presence' then 'set'
    else v_text
  end;
end;
$$;

-- "Rent changed"; an action without a label reads "Change".
create function audit_action_label(p_action text)
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

-- Title and details for one entry. Columns are shown in this order; any not
-- listed is never shown. A new or removed row lists its values, an edit
-- shows before → after.
create function audit_describe(p_action text, p_changes jsonb, p_context jsonb, out title text, out details text)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_snapshot boolean := split_part(p_action, '.', 2) in ('created', 'recorded', 'added', 'set', 'started', 'deleted');
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
      (1, 'name', 'Name', 'text'),
      (2, 'business_name', 'Business', 'text'),
      (3, 'phone', 'Phone', 'text'),
      (4, 'preferred_channel', 'Messages by', 'channel'),
      (5, 'status', 'Status', 'status'),
      (6, 'tenant_kind', 'Tenant type', 'kind'),
      (7, 'rent_tracked', 'Rent tracked here', 'yesNo'),
      (8, 'lease_start', 'Lease start', 'date'),
      (9, 'billing_start', 'Billing from', 'month'),
      (10, 'moved_out_on', 'Moved out on', 'date'),
      (11, 'deposit_amount', 'Deposit', 'money'),
      (12, 'unit_code', 'House', 'text'),
      (13, 'start_date', 'From', 'date'),
      (14, 'end_date', 'Until', 'date'),
      (15, 'effective_month', 'From month', 'month'),
      (16, 'monthly_amount', 'Monthly rent', 'money'),
      (17, 'period_month', 'Month', 'month'),
      (18, 'amount_due', 'Rent due', 'money'),
      (19, 'receipt_no', 'Receipt', 'text'),
      (20, 'amount', 'Amount', 'money'),
      (21, 'delta_amount', 'Change', 'money'),
      (22, 'payment_date', 'Paid on', 'date'),
      (23, 'mode', 'Mode', 'mode'),
      (24, 'reason', 'Reason', 'text'),
      (25, 'note', 'Note', 'text'),
      (26, 'acknowledged_at', 'Acknowledged', 'datetime'),
      (27, 'address', 'Address', 'text'),
      (28, 'location_code', 'Site', 'text'),
      (29, 'property_code', 'Tower', 'text'),
      (30, 'floor', 'Floor', 'floor'),
      (31, 'unit_type', 'Type', 'unitType'),
      (32, 'label', 'Label', 'text'),
      (33, 'is_active', 'In use', 'yesNo'),
      (34, 'document_type', 'Type', 'text'),
      (35, 'file_name', 'File', 'text'),
      (36, 'size_bytes', 'Size', 'bytes'),
      (37, 'first_name', 'First name', 'text'),
      (38, 'last_name', 'Last name', 'text'),
      (39, 'signature_name', 'Signs as', 'text'),
      (40, 'signature_path', 'Saved signature', 'presence'),
      (41, 'user_id', 'Account', 'presence')
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

-- Who, as the history shows it: the owner's name (their profile; "Owner"
-- before one is set up), or what the actor was.
create function audit_actor_name(p_kind text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case p_kind
    when 'owner' then coalesce(
      (select nullif(btrim(concat_ws(' ', first_name, last_name)), '') from owner_profile),
      'Owner'
    )
    when 'tenant' then 'Tenant'
    when 'system' then 'System'
    when 'visitor' then 'Not signed in'
    else 'System'
  end
$$;

-- 2. The stored text ----------------------------------------------------------

alter table audit_log
  add column title text,
  add column details text,
  add column actor_name text;

comment on column audit_log.title is 'What happened, as shown in the history ("Rent changed"). Written once on insert (D27).';
comment on column audit_log.details is 'The changed values as shown, lines joined with " · ". Written once on insert (D27).';
comment on column audit_log.actor_name is 'Who, as shown: the owner''s name at the time, or Tenant / System / Not signed in (D27).';

create function audit_log_fill_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select d.title, d.details into new.title, new.details from audit_describe(new.action, new.changes, new.context) d;
  new.actor_name := audit_actor_name(new.actor_kind);
  return new;
end;
$$;

create trigger audit_log_text before insert on audit_log
  for each row execute function audit_log_fill_text();

-- Backfill: the only time a row is ever updated. The immutability trigger is
-- off for this statement alone.
alter table audit_log disable trigger audit_log_no_update;
update audit_log a
set title = d.title, details = d.details, actor_name = audit_actor_name(a.actor_kind)
from audit_log s
cross join lateral audit_describe(s.action, s.changes, s.context) d
where s.id = a.id;
alter table audit_log enable trigger audit_log_no_update;

alter table audit_log
  alter column title set not null,
  alter column details set not null,
  alter column actor_name set not null;

-- 3. A tenant's Change history, one page (A14) --------------------------------

-- A user's text as a LIKE pattern piece: % and _ match themselves.
create function like_escape(p_text text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- One text filter, as the table's filter panel offers them. A filter
-- without a value keeps everything.
create function audit_text_matches(p_text text, p_operator text, p_value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(case
    when p_operator = 'isEmpty' then coalesce(btrim(p_text), '') = ''
    when p_operator = 'isNotEmpty' then coalesce(btrim(p_text), '') <> ''
    when coalesce(btrim(p_value), '') = '' then true
    when p_operator = 'contains' then p_text ilike '%' || like_escape(btrim(p_value)) || '%'
    when p_operator = 'equals' then lower(p_text) = lower(btrim(p_value))
    when p_operator = 'startsWith' then p_text ilike like_escape(btrim(p_value)) || '%'
    when p_operator = 'endsWith' then p_text ilike '%' || like_escape(btrim(p_value))
  end, false)
$$;

create function audit_field(p_row audit_log, p_field text)
returns text
language sql
immutable
as $$
  select case p_field
    when 'actor_name' then p_row.actor_name
    when 'title' then p_row.title
    when 'unit_code' then p_row.unit_code
    when 'details' then p_row.details
  end
$$;

-- Whether a row is on the table: Show (actions), the From/To days, every
-- search word somewhere in who / what / house / details, and the filters.
create function audit_matches(
  p_row audit_log,
  p_actions text[],
  p_from date,
  p_to date,
  p_words text[],
  p_filters jsonb,
  p_logic text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select (p_actions is null or p_row.action = any (p_actions))
    and (p_from is null or (p_row.at at time zone 'Asia/Kolkata')::date >= p_from)
    and (p_to is null or (p_row.at at time zone 'Asia/Kolkata')::date <= p_to)
    and not exists (
      select 1 from unnest(p_words) as w
      where not (concat_ws(E'\n', p_row.actor_name, p_row.title, p_row.unit_code, p_row.details) ilike '%' || like_escape(w) || '%')
    )
    and case
      when p_logic = 'or' then
        not exists (select 1 from jsonb_array_elements(p_filters))
        or exists (
          select 1 from jsonb_array_elements(p_filters) as f
          where audit_text_matches(audit_field(p_row, f ->> 'field'), f ->> 'operator', f ->> 'value')
        )
      else
        not exists (
          select 1 from jsonb_array_elements(p_filters) as f
          where not audit_text_matches(audit_field(p_row, f ->> 'field'), f ->> 'operator', f ->> 'value')
        )
    end
$$;

-- One page of a tenant's history: {rows, total (matching), all (the
-- tenant's), page}. A page past the end returns the last one. Security
-- invoker: RLS (is_app_owner()) decides what the caller sees.
create function tenant_history_page(
  p_tenant_id uuid,
  p_actions text[] default null,
  p_from date default null,
  p_to date default null,
  p_search text default null,
  p_filters jsonb default '[]'::jsonb,
  p_logic text default 'and',
  p_sort text default 'at',
  p_dir text default 'desc',
  p_page int default 0,
  p_page_size int default 10
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_words text[] := array(
    select w from regexp_split_to_table(btrim(coalesce(p_search, '')), '\s+') as w where w <> ''
  );
  v_filters jsonb;
  v_total int;
  v_all int;
  v_page int;
  v_rows jsonb;
begin
  if p_sort not in ('at', 'actor_name', 'title', 'unit_code')
    or p_dir not in ('asc', 'desc')
    or p_logic not in ('and', 'or')
    or p_page < 0
    or p_page_size not between 1 and 100
    or jsonb_typeof(coalesce(p_filters, '[]'::jsonb)) <> 'array'
  then
    raise exception 'That history query isn''t valid' using errcode = 'BBK00';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
    where f ->> 'field' is null or f ->> 'field' not in ('actor_name', 'title', 'unit_code', 'details')
      or f ->> 'operator' is null
      or f ->> 'operator' not in ('contains', 'equals', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty')
  ) then
    raise exception 'That history filter isn''t valid' using errcode = 'BBK00';
  end if;

  -- Only filters that filter: one with a value, or an empty / not-empty check.
  v_filters := coalesce(
    (select jsonb_agg(f) from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) as f
     where f ->> 'operator' in ('isEmpty', 'isNotEmpty') or coalesce(btrim(f ->> 'value'), '') <> ''),
    '[]'::jsonb
  );

  select count(*) into v_all from audit_log where tenant_id = p_tenant_id;
  select count(*) into v_total from audit_log a
  where a.tenant_id = p_tenant_id and audit_matches(a, p_actions, p_from, p_to, v_words, v_filters, p_logic);
  v_page := least(p_page, greatest(0, ceil(v_total::numeric / p_page_size)::int - 1));

  select coalesce(jsonb_agg(x.row order by x.n), '[]'::jsonb) into v_rows
  from (
    select to_jsonb(a) as row,
      row_number() over (
        order by
          case when p_dir = 'asc' then lower(audit_field(a, p_sort)) end asc nulls last,
          case when p_dir = 'desc' then lower(audit_field(a, p_sort)) end desc nulls last,
          case when p_sort = 'at' and p_dir = 'asc' then a.id end asc,
          a.id desc
      ) as n
    from audit_log a
    where a.tenant_id = p_tenant_id and audit_matches(a, p_actions, p_from, p_to, v_words, v_filters, p_logic)
  ) as x
  where x.n > v_page * p_page_size and x.n <= (v_page + 1) * p_page_size;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'all', v_all, 'page', v_page);
end;
$$;

-- 4. Grants ----------------------------------------------------------------------

revoke all on function audit_money(numeric) from public, anon, authenticated;
revoke all on function audit_short_month(date) from public, anon, authenticated;
revoke all on function audit_date(date) from public, anon, authenticated;
revoke all on function audit_month(date) from public, anon, authenticated;
revoke all on function audit_datetime(timestamptz) from public, anon, authenticated;
revoke all on function audit_value(jsonb, text) from public, anon, authenticated;
revoke all on function audit_action_label(text) from public, anon, authenticated;
revoke all on function audit_describe(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function audit_actor_name(text) from public, anon, authenticated;
revoke all on function audit_log_fill_text() from public, anon, authenticated;
revoke all on function like_escape(text) from public, anon, authenticated;
revoke all on function audit_text_matches(text, text, text) from public, anon, authenticated;
revoke all on function audit_field(audit_log, text) from public, anon, authenticated;
revoke all on function audit_matches(audit_log, text[], date, date, text[], jsonb, text) from public, anon, authenticated;
revoke all on function tenant_history_page(uuid, text[], date, date, text, jsonb, text, text, text, int, int)
  from public, anon, authenticated;

-- tenant_history_page runs as the owner (security invoker), so the owner
-- needs the helpers it calls; they are pure and read nothing themselves.
grant execute on function like_escape(text) to authenticated;
grant execute on function audit_text_matches(text, text, text) to authenticated;
grant execute on function audit_field(audit_log, text) to authenticated;
grant execute on function audit_matches(audit_log, text[], date, date, text[], jsonb, text) to authenticated;
grant execute on function tenant_history_page(uuid, text[], date, date, text, jsonb, text, text, text, int, int)
  to authenticated;
