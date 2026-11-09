-- The tenant portal, hardened after review (A32, D37 in docs/database-design.md).
-- 0033 is already applied, so the changes come here:
--   1. tenant_reader must not have SUPERUSER, REPLICATION or BYPASSRLS: RLS is
--      the only thing keeping a tenant to their own rows. Like 0027 for
--      app_drizzle, refuse instead of trying to remove them (only a superuser
--      can, and Supabase's postgres isn't one).
--   2. The policies read current_tenant_id() once per statement
--      (`(select current_tenant_id())`), not once per row.
--   3. `recorded_by` (the owner's account id) is hidden on every table the
--      tenant reads, as it already was on payments/adjustments: column grants
--      on tenant_units, tenant_rent_rates and tenant_documents.
-- Safe to run again.

do $$
begin
  if exists (
    select 1 from pg_roles where rolname = 'tenant_reader' and (rolsuper or rolreplication or rolbypassrls or rolcanlogin)
  ) then
    raise exception 'tenant_reader has SUPERUSER, REPLICATION, BYPASSRLS or LOGIN: tenants could read every tenant''s rows'
      using hint = 'Run "drop owned by tenant_reader; drop role tenant_reader;", then run 0033 and 0034 again.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Policies: the tenant id once per statement
-- ---------------------------------------------------------------------------

drop policy if exists "tenant reads self" on tenants;
drop policy if exists "tenant reads own rent months" on rent_periods;
drop policy if exists "tenant reads own payments" on payments;
drop policy if exists "tenant reads own adjustments" on adjustments;
drop policy if exists "tenant reads own tenancies" on tenant_units;
drop policy if exists "tenant reads own rent rates" on tenant_rent_rates;
drop policy if exists "tenant reads own documents" on tenant_documents;
drop policy if exists "tenant reads own payment proofs" on payment_proofs;
drop policy if exists "tenant reads own houses" on units;
drop policy if exists "tenant reads own towers" on properties;

create policy "tenant reads self" on tenants
  for select to tenant_reader using (id = (select current_tenant_id()));
create policy "tenant reads own rent months" on rent_periods
  for select to tenant_reader using (tenant_id = (select current_tenant_id()));
create policy "tenant reads own payments" on payments
  for select to tenant_reader using (tenant_id = (select current_tenant_id()));
create policy "tenant reads own adjustments" on adjustments
  for select to tenant_reader using (tenant_id = (select current_tenant_id()));
create policy "tenant reads own tenancies" on tenant_units
  for select to tenant_reader using (tenant_id = (select current_tenant_id()));
create policy "tenant reads own rent rates" on tenant_rent_rates
  for select to tenant_reader using (tenant_id = (select current_tenant_id()));
create policy "tenant reads own documents" on tenant_documents
  for select to tenant_reader using (tenant_id = (select current_tenant_id()));
create policy "tenant reads own payment proofs" on payment_proofs
  for select to tenant_reader using (
    exists (
      select 1 from payments p
      where p.id = payment_proofs.payment_id and p.tenant_id = (select current_tenant_id())
    )
  );
create policy "tenant reads own houses" on units
  for select to tenant_reader using (
    exists (
      select 1 from tenant_units tu
      where tu.unit_code = units.unit_code and tu.tenant_id = (select current_tenant_id())
    )
  );
create policy "tenant reads own towers" on properties
  for select to tenant_reader using (
    exists (
      select 1 from tenant_units tu join units u on u.unit_code = tu.unit_code
      where u.property_code = properties.property_code and tu.tenant_id = (select current_tenant_id())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. No recorded_by for the tenant
-- ---------------------------------------------------------------------------

revoke select on tenant_units, tenant_rent_rates, tenant_documents from tenant_reader;
grant select (id, tenant_id, unit_code, start_date, end_date, created_at) on tenant_units to tenant_reader;
grant select (id, tenant_id, effective_month, monthly_amount, created_at) on tenant_rent_rates to tenant_reader;
grant select (id, tenant_id, document_type, storage_path, file_name, content_type, size_bytes, created_at)
  on tenant_documents to tenant_reader;
