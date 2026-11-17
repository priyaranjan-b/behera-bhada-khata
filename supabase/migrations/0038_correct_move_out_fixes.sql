-- correct_move_out, revised after review (D40 in docs/database-design.md).
-- As in 0037, except:
--
--   * a future date is allowed, as move_out_tenant allows it (a tenant who
--     gave notice is moved out ahead of time), and the same date is a no-op
--     before any other check;
--   * a tracked tenant's date can't fall before the month billing started
--     (it would drop every month and leave billing starting after the
--     move-out);
--   * the tenant's rent months and the other tenancies of their houses are
--     locked before they are checked, and a tenancy let at the same moment
--     still answers BBK09, not a raw exclusion error.
--
-- create or replace keeps the grants of 0037; they are repeated anyway.

create or replace function correct_move_out(p_tenant_id uuid, p_move_out_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_old date;
  v_tracked boolean;
  v_billing_start date;
  v_bad record;
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;

  select status, moved_out_on, rent_tracked, billing_start into v_status, v_old, v_tracked, v_billing_start
  from tenants where id = p_tenant_id
  for update;
  if not found then
    raise exception 'Tenant not found' using errcode = 'BBK04';
  end if;
  if v_status <> 'inactive' or v_old is null then
    raise exception 'Only a moved-out tenant''s move-out date can be corrected' using errcode = 'BBK09';
  end if;
  if p_move_out_date is null then
    raise exception 'Choose the move-out date' using errcode = 'BBK00';
  end if;
  if p_move_out_date = v_old then
    return;
  end if;
  if v_tracked and v_billing_start is not null and p_move_out_date < v_billing_start then
    raise exception 'Billing started in %, so the move-out date can''t be before it', to_char(v_billing_start, 'FMMonth YYYY')
      using errcode = 'BBK00';
  end if;

  -- Lock the tenant's houses and rent months, then check them against the new date.
  perform 1 from tenant_units where tenant_id = p_tenant_id for update;
  perform 1 from rent_periods where tenant_id = p_tenant_id for update;

  select unit_code, start_date into v_bad
  from tenant_units
  where tenant_id = p_tenant_id and start_date > p_move_out_date
  order by start_date
  limit 1;
  if found then
    raise exception 'The move-out date is before % was taken (%)', v_bad.unit_code, to_char(v_bad.start_date, 'DD/MM/YYYY')
      using errcode = 'BBK00';
  end if;

  if p_move_out_date > v_old then
    perform 1
    from tenant_units o
    where o.tenant_id <> p_tenant_id
      and o.unit_code in (select unit_code from tenant_units where tenant_id = p_tenant_id and end_date = v_old)
    for update;

    select o.unit_code, o.start_date into v_bad
    from tenant_units mine
    join tenant_units o on o.unit_code = mine.unit_code and o.tenant_id <> p_tenant_id
    where mine.tenant_id = p_tenant_id
      and mine.end_date = v_old
      and o.start_date > v_old
      and o.start_date <= p_move_out_date
    order by o.start_date
    limit 1;
    if found then
      raise exception '% was let to another tenant from %, so this tenant can''t have stayed until then',
        v_bad.unit_code, to_char(v_bad.start_date, 'DD/MM/YYYY')
        using errcode = 'BBK09';
    end if;
  end if;

  if date_trunc('month', p_move_out_date) < date_trunc('month', v_old)
    and has_allocations_from(p_tenant_id, (date_trunc('month', p_move_out_date) + interval '1 month')::date) then
    raise exception 'A payment is recorded for a month after %, so it can''t be the last month. Correct the payment with an adjustment first.',
      to_char(p_move_out_date, 'FMMonth YYYY')
      using errcode = 'BBK09';
  end if;

  -- The houses held until the old date (and any held past the new one) end on the new date.
  begin
    update tenant_units set end_date = p_move_out_date
    where tenant_id = p_tenant_id and (end_date = v_old or end_date > p_move_out_date);
  exception when exclusion_violation then
    raise exception 'One of the houses was let to another tenant by %, so this tenant can''t have stayed until then',
      to_char(p_move_out_date, 'DD/MM/YYYY')
      using errcode = 'BBK09';
  end;

  update tenants set moved_out_on = p_move_out_date where id = p_tenant_id;

  if v_tracked and v_billing_start is not null then
    delete from rent_periods
    where tenant_id = p_tenant_id
      and period_month >= (date_trunc('month', p_move_out_date) + interval '1 month')::date;
    perform ensure_rent_periods(array[p_tenant_id], date_trunc('month', p_move_out_date)::date);
  end if;
end;
$$;

revoke all on function correct_move_out(uuid, date) from public, anon, authenticated;
grant execute on function correct_move_out(uuid, date) to authenticated;
