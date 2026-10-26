-- The tenant page's account figures as one aggregate (A16, D29).
--
-- The Outstanding and Months overdue cards, Move out's amount owed and
-- "Stop tracking" need five numbers and a yes/no. They used to be computed in
-- JS from every rent month, payment and adjustment the tenant ever had; now
-- the database returns just the figures. The rules are unchanged:
--   * summarizeBalance (src/lib/domain/allocation.ts): a month is owed once it
--     has ended (before app_current_month(), Asia/Kolkata, 0019), and only
--     what is still unpaid counts; later months are "not due yet";
--   * ended months, and how many of them are paid;
--   * stop tracking (0016): a current, tracked government tenant with no
--     payment, no adjustment and nothing allocated to any month. Spelled out
--     here because has_allocations_from is not executable by the owner, and
--     stop_rent_tracking itself still enforces the rule.
-- Security invoker: RLS (is_app_owner()) decides what is visible, so anyone
-- but the owner gets zeros and false.

create function tenant_account_summary(p_tenant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total_outstanding', coalesce(sum(r.amount_due - r.amount_allocated)
      filter (where r.period_month < m.cur and r.amount_due > r.amount_allocated), 0),
    'overdue_months', count(r.id) filter (where r.period_month < m.cur and r.amount_due > r.amount_allocated),
    'not_yet_due', coalesce(sum(r.amount_due - r.amount_allocated)
      filter (where r.period_month >= m.cur and r.amount_due > r.amount_allocated), 0),
    'ended_months', count(r.id) filter (where r.period_month < m.cur),
    'paid_ended_months', count(r.id) filter (where r.period_month < m.cur and r.status = 'paid'),
    'can_stop_rent_tracking', exists (
      select 1 from tenants t
      where t.id = p_tenant_id
        and t.tenant_kind = 'government' and t.status = 'active' and t.rent_tracked
        and not exists (select 1 from payments p where p.tenant_id = t.id)
        and not exists (select 1 from adjustments a where a.tenant_id = t.id)
        and not exists (select 1 from rent_periods x where x.tenant_id = t.id and x.amount_allocated <> 0)
    )
  )
  from (select app_current_month() as cur) m
  left join rent_periods r on r.tenant_id = p_tenant_id
$$;

revoke all on function tenant_account_summary(uuid) from public, anon, authenticated;
grant execute on function tenant_account_summary(uuid) to authenticated;
