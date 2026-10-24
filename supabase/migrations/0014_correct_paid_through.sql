-- Correcting "rent paid up to" on an active tenant (D24 in
-- docs/database-design.md).
--
-- billing_start (0008) is set once, from "rent paid up to", when a tenant is
-- onboarded or a draft is completed. A wrong month there either invents
-- arrears or hides them, and until now only hand-written SQL could fix it.
-- correct_paid_through moves billing_start to the month after the corrected
-- "paid up to" (never before the lease month, as billing_start_for does):
--
--   * earlier: the missing months are created (owed), and the first rent
--     rate is moved back to start with them, at the same amount;
--   * later: the months before it are removed - refused (BBK09) if any
--     payment or adjustment is recorded against one of them.
--
-- Payments already recorded stay on the months they were applied to.

create function correct_paid_through(p_tenant_id uuid, p_paid_through date)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease_start date;
  v_status text;
  v_old date;
  v_new date;
  v_first_rate date;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;

  select lease_start, status, billing_start into v_lease_start, v_status, v_old
  from tenants where id = p_tenant_id
  for update;
  if not found then
    raise exception 'Tenant not found' using errcode = 'BBK04';
  end if;
  if v_status <> 'active' then
    raise exception 'Only a current tenant''s "paid up to" can be corrected' using errcode = 'BBK09';
  end if;
  if p_paid_through is null then
    raise exception 'Choose the last month that was paid' using errcode = 'BBK00';
  end if;
  if date_trunc('month', p_paid_through) > date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '12 months' then
    raise exception 'Rent can''t have been paid more than a year ahead' using errcode = 'BBK00';
  end if;

  v_new := billing_start_for(v_lease_start, p_paid_through);
  if v_new = v_old then
    return v_old;
  end if;

  if v_new > v_old then
    if exists (
      select 1 from rent_periods r
      where r.tenant_id = p_tenant_id
        and r.period_month < v_new
        and (
          exists (select 1 from payment_allocations a where a.rent_period_id = r.id)
          or exists (select 1 from adjustment_allocations a where a.rent_period_id = r.id)
        )
    ) then
      raise exception 'A payment is recorded for a month before %, so it can''t be marked as paid on paper',
        to_char(v_new, 'FMMonth YYYY')
        using errcode = 'BBK09';
    end if;
    delete from rent_periods where tenant_id = p_tenant_id and period_month < v_new;
  end if;

  update tenants set billing_start = v_new where id = p_tenant_id;

  if v_new < v_old then
    -- The first rent rate starts with billing, so the new months are priced.
    select min(effective_month) into v_first_rate from tenant_rent_rates where tenant_id = p_tenant_id;
    if v_first_rate > v_new then
      update tenant_rent_rates set effective_month = v_new
      where tenant_id = p_tenant_id and effective_month = v_first_rate;
    end if;
    perform ensure_rent_periods(array[p_tenant_id], (v_old - interval '1 month')::date);
  end if;

  return v_new;
end;
$$;

revoke all on function correct_paid_through(uuid, date) from public, anon, authenticated;
grant execute on function correct_paid_through(uuid, date) to authenticated;
