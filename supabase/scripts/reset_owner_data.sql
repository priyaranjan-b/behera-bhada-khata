-- DESTROYS every property, tenant, payment, adjustment and rent period, for
-- every owner. For resetting TEST data only - e.g. before migration 0006,
-- which refuses to run while properties or tenants exist.
--
-- Storage files (signatures, receipts) in the rent-register bucket are not
-- touched; delete them from Storage separately if you want them gone too.
--
-- Run by hand in the SQL Editor. Not a migration.

begin;

truncate table
  adjustment_allocations,
  adjustments,
  payment_allocations,
  payments,
  rent_periods,
  tenants,
  properties
restart identity cascade;

commit;
