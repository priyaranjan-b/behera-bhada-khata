-- Single owner. The rent book belongs to one person, so instead of stamping
-- every row with owner_id, the owner is recorded once in app_owner and every
-- policy asks is_app_owner(). With no app_owner row nobody can read or write
-- anything: it fails closed. supabase/seed/arnapal_master_data.sql claims
-- ownership for the email you put in it.

create table app_owner (
  -- At most one row.
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users (id),
  created_at timestamptz not null default now()
);

alter table app_owner enable row level security;
-- No policies: only is_app_owner() (security definer) and the service role read it.
revoke all on app_owner from anon, authenticated;

comment on table app_owner is 'The one account that owns this rent book. Change it deliberately with an UPDATE as the database owner.';

create function is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from app_owner where user_id = (select auth.uid()));
$$;

revoke all on function is_app_owner() from public, anon;
grant execute on function is_app_owner() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Replace the per-row owner policies from 0001
-- ---------------------------------------------------------------------------

drop policy "owner manages own properties" on properties;
drop policy "owner manages own tenants" on tenants;
drop policy "owner reads own rent periods" on rent_periods;
drop policy "owner reads own payments" on payments;
drop policy "owner creates payments" on payments;
drop policy "owner rotates share link on own pending payments" on payments;
drop policy "owner reads own payment allocations" on payment_allocations;
drop policy "owner creates payment allocations" on payment_allocations;
drop policy "owner reads own adjustments" on adjustments;
drop policy "owner creates adjustments" on adjustments;
drop policy "owner rotates share link on own pending adjustments" on adjustments;
drop policy "owner reads own adjustment allocations" on adjustment_allocations;
drop policy "owner creates adjustment allocations" on adjustment_allocations;

alter table properties drop column owner_id;
alter table tenants drop column owner_id;
alter table payments drop column owner_id;
alter table adjustments drop column owner_id;

create policy "owner manages properties" on properties
  for all to authenticated using (is_app_owner()) with check (is_app_owner());

create policy "owner manages tenants" on tenants
  for all to authenticated using (is_app_owner()) with check (is_app_owner());

create policy "owner reads rent periods" on rent_periods
  for select to authenticated using (is_app_owner());

-- Ledger: read, create pending rows, and rotate the share link of a pending
-- row (the column grants from 0001 still limit UPDATE to the token columns).
create policy "owner reads payments" on payments
  for select to authenticated using (is_app_owner());
create policy "owner creates pending payments" on payments
  for insert to authenticated with check (is_app_owner() and status = 'pending');
create policy "owner rotates share link on pending payments" on payments
  for update to authenticated
  using (is_app_owner() and status = 'pending') with check (is_app_owner() and status = 'pending');

create policy "owner reads payment allocations" on payment_allocations
  for select to authenticated using (is_app_owner());
create policy "owner allocates pending payments" on payment_allocations
  for insert to authenticated
  with check (
    is_app_owner()
    and exists (select 1 from payments where payments.id = payment_allocations.payment_id and payments.status = 'pending')
  );

create policy "owner reads adjustments" on adjustments
  for select to authenticated using (is_app_owner());
create policy "owner creates pending adjustments" on adjustments
  for insert to authenticated with check (is_app_owner() and status = 'pending');
create policy "owner rotates share link on pending adjustments" on adjustments
  for update to authenticated
  using (is_app_owner() and status = 'pending') with check (is_app_owner() and status = 'pending');

create policy "owner reads adjustment allocations" on adjustment_allocations
  for select to authenticated using (is_app_owner());
create policy "owner allocates pending adjustments" on adjustment_allocations
  for insert to authenticated
  with check (
    is_app_owner()
    and exists (select 1 from adjustments where adjustments.id = adjustment_allocations.adjustment_id and adjustments.status = 'pending')
  );
