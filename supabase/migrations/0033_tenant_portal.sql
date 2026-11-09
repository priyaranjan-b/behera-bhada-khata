-- The tenant portal (A32, D37 in docs/database-design.md): a tenant signs in
-- with their phone and an SMS code and reads their own account, read-only.
--
-- Tenants are not Supabase Auth users. The app checks the code (Twilio
-- Verify), keeps its own session in tenant_sessions and reads the tenant's
-- data as tenant_reader, a role that can only SELECT one tenant's rows:
--   * RLS policies `to tenant_reader` only, keyed on current_tenant_id(),
--     which inScope() (src/server/adapters/drizzle/client.ts) sets per
--     transaction from the verified session. The owner's policies (`to
--     authenticated using (is_app_owner())`) are untouched, so a signed-in
--     Supabase account that isn't the owner still sees nothing.
--   * SELECT only, and on payments/adjustments only the columns the tenant
--     page shows (never the confirm-link token hash or the storage paths).
--   * No function grants beyond current_tenant_id(): every function revokes
--     PUBLIC (D11), and the write functions check is_app_owner() first, which
--     is false here (auth.uid() is null).
-- app_drizzle may switch to it (like authenticated, 0027); PostgREST's
-- authenticator may not, so no browser JWT can ever act as it.

-- ---------------------------------------------------------------------------
-- The role
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tenant_reader') then
    create role tenant_reader nologin noinherit;
  end if;
end
$$;

alter role tenant_reader nologin noinherit nocreatedb nocreaterole;
grant usage on schema public to tenant_reader;
-- Never inherited: app_drizzle acts as it only after inScope() switches role.
grant tenant_reader to app_drizzle with inherit false, set true;

-- The tenant a tenant_reader transaction is for; null (no rows) when unset.
create function current_tenant_id()
returns uuid
language sql
stable
set search_path = public
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

revoke all on function current_tenant_id() from public, anon, authenticated, service_role;
grant execute on function current_tenant_id() to tenant_reader;

-- ---------------------------------------------------------------------------
-- What a tenant may read: their own rows
-- ---------------------------------------------------------------------------

grant select on tenants, rent_periods, tenant_units, tenant_rent_rates, units, properties,
  payment_proofs, tenant_documents, unit_occupancy to tenant_reader;
-- The ledger without the confirm-link token, signatures, stored PDF or who recorded it.
grant select (id, tenant_id, status, receipt_no, created_at, confirmed_at, acknowledged_at,
  amount, payment_date, mode, note) on payments to tenant_reader;
grant select (id, tenant_id, status, receipt_no, created_at, confirmed_at, acknowledged_at,
  original_payment_id, delta_amount, reason) on adjustments to tenant_reader;
-- The owner's tags (who received it...) are internal: readable so the ledger
-- query runs, but no policy lets a tenant see a row.
grant select on payment_record_tags to tenant_reader;

create policy "tenant reads self" on tenants
  for select to tenant_reader using (id = current_tenant_id());
create policy "tenant reads own rent months" on rent_periods
  for select to tenant_reader using (tenant_id = current_tenant_id());
create policy "tenant reads own payments" on payments
  for select to tenant_reader using (tenant_id = current_tenant_id());
create policy "tenant reads own adjustments" on adjustments
  for select to tenant_reader using (tenant_id = current_tenant_id());
create policy "tenant reads own tenancies" on tenant_units
  for select to tenant_reader using (tenant_id = current_tenant_id());
create policy "tenant reads own rent rates" on tenant_rent_rates
  for select to tenant_reader using (tenant_id = current_tenant_id());
create policy "tenant reads own documents" on tenant_documents
  for select to tenant_reader using (tenant_id = current_tenant_id());
create policy "tenant reads own payment proofs" on payment_proofs
  for select to tenant_reader using (
    exists (select 1 from payments p where p.id = payment_proofs.payment_id and p.tenant_id = current_tenant_id())
  );
create policy "tenant reads own houses" on units
  for select to tenant_reader using (
    exists (select 1 from tenant_units tu where tu.unit_code = units.unit_code and tu.tenant_id = current_tenant_id())
  );
create policy "tenant reads own towers" on properties
  for select to tenant_reader using (
    exists (
      select 1 from tenant_units tu join units u on u.unit_code = tu.unit_code
      where u.property_code = properties.property_code and tu.tenant_id = current_tenant_id()
    )
  );

-- Signing in looks tenants up by phone.
create index if not exists tenants_phone_idx on tenants (phone) where phone is not null;

-- ---------------------------------------------------------------------------
-- Tenant sessions
-- ---------------------------------------------------------------------------

-- One row per phone sign-in. The browser holds a random token; only its
-- sha256 is stored, so a database leak can't be replayed as a session.
-- `tenant_id` is the tenancy the session reads (null until chosen, when one
-- phone has several). The session ends at expires_at, when revoked (sign
-- out), or as soon as the tenant's phone no longer matches (checked on every
-- request in src/server/services/tenantAuth.ts). Service role only.
create table tenant_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  tenant_id uuid references tenants (id) on update restrict on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  -- A short hash of the sign-in IP, to tell sessions apart; never the IP.
  ip_hash text,
  constraint tenant_sessions_expiry check (expires_at > created_at)
);

create index tenant_sessions_expires_at_idx on tenant_sessions (expires_at);

comment on table tenant_sessions is
  'Tenant portal sign-ins (A32, D37): the hash of a random session token, the phone and the tenancy it reads. Service role only.';

alter table tenant_sessions enable row level security;
revoke all on tenant_sessions from public, anon, authenticated;
grant select, insert, update, delete on tenant_sessions to service_role;
