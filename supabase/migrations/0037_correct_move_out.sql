-- Correcting a moved-out tenant's move-out date (D40 in
-- docs/database-design.md).
--
-- move_out_tenant (0007) bills up to and including the move-out month and
-- refuses a tenant who has already moved out, so a wrong date (5 Oct for a
-- tenant who left at the end of September) left an unpaid month that only
-- hand-written SQL could remove. correct_move_out moves the date, in one
-- transaction:
--
--   * the houses held up to the old date end on the new one instead
--     (refused if a house was let to someone else in between, or the new
--     date is before a house was taken);
--   * earlier month: the months after it are removed - refused (BBK09) if
--     any payment or adjustment is recorded against one of them;
--   * later month: the months up to it are created, owed at the rent then.
--
-- Payments already recorded stay on the months they were applied to.

create function correct_move_out(p_tenant_id uuid, p_move_out_date date)
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
  if p_move_out_date > (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'The move-out date can''t be in the future' using errcode = 'BBK00';
  end if;
  if p_move_out_date = v_old then
    return;
  end if;

  -- Lock the tenant's houses, then check them against the new date.
  perform 1 from tenant_units where tenant_id = p_tenant_id for update;

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
  update tenant_units set end_date = p_move_out_date
  where tenant_id = p_tenant_id and (end_date = v_old or end_date > p_move_out_date);

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
