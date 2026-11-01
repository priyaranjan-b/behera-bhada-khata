-- Correcting a rent entered wrongly (D31 in docs/database-design.md).
--
-- update_tenant changes rent from a month and refuses once a payment is
-- recorded for that month or later: right for a real increase, where paid
-- months keep their price. A typo (1,100 for 1,000) is different: the rent
-- was always meant to be the other amount, so every month since is wrong,
-- paid ones included, and nothing could fix it short of hand-written SQL.
--
-- correct_rent sets the rent from a month on: rates after that month are
-- replaced, and every rent month from it is re-priced, paid or not. It is
-- refused (BBK09) only if a month already has more counted against it than
-- the corrected rent, so allocations stay within [0, amount_due] (D5).
-- Payments and their allocations are never touched; the audit triggers on
-- tenant_rent_rates and rent_periods record the change.

create function correct_rent(p_tenant_id uuid, p_from_month date, p_monthly_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billing_start date;
  v_from date;
  v_amount numeric(12, 2);
  v_over record;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;

  select billing_start into v_billing_start
  from tenants where id = p_tenant_id
  for update;
  if not found then
    raise exception 'Tenant not found' using errcode = 'BBK04';
  end if;
  if v_billing_start is null then
    raise exception 'This tenant isn''t billed, so there is no rent to correct' using errcode = 'BBK09';
  end if;
  if p_monthly_amount is null or p_monthly_amount <= 0 then
    raise exception 'Monthly rent must be more than zero' using errcode = 'BBK00';
  end if;
  if p_from_month is null then
    raise exception 'Choose the month the rent was wrong from' using errcode = 'BBK00';
  end if;

  v_from := date_trunc('month', p_from_month)::date;
  v_amount := round(p_monthly_amount, 2);
  if v_from < v_billing_start then
    raise exception 'Billing starts %; correct from that month or later', to_char(v_billing_start, 'FMMonth YYYY')
      using errcode = 'BBK00';
  end if;

  perform 1 from rent_periods
  where tenant_id = p_tenant_id and period_month >= v_from
  order by period_month
  for update;

  select period_month, amount_allocated into v_over
  from rent_periods
  where tenant_id = p_tenant_id and period_month >= v_from and amount_allocated > v_amount
  order by period_month
  limit 1;
  if found then
    raise exception '% is already counted for %, more than the corrected rent - record an adjustment first',
      audit_money(v_over.amount_allocated), to_char(v_over.period_month, 'FMMonth YYYY')
      using errcode = 'BBK09';
  end if;

  delete from tenant_rent_rates where tenant_id = p_tenant_id and effective_month > v_from;
  insert into tenant_rent_rates (tenant_id, effective_month, monthly_amount)
  values (p_tenant_id, v_from, v_amount)
  on conflict (tenant_id, effective_month) do update set monthly_amount = excluded.monthly_amount;

  update rent_periods r
  set amount_due = rent_for_month(p_tenant_id, r.period_month)
  where r.tenant_id = p_tenant_id and r.period_month >= v_from
    and r.amount_due is distinct from rent_for_month(p_tenant_id, r.period_month);
end;
$$;

revoke all on function correct_rent(uuid, date, numeric) from public, anon, authenticated;
grant execute on function correct_rent(uuid, date, numeric) to authenticated;
