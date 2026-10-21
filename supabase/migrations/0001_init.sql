-- Digital Rent Register schema
-- Design principle: payments and adjustments are append-only (see "Immutability &
-- corrections" in the plan). Only INSERT/SELECT are granted to the app-facing
-- Postgres roles (anon, authenticated) on the ledger tables; the transition from
-- pending -> confirmed (after the tenant signs + verifies OTP) is performed only
-- by trusted server code using the Supabase service/secret-key client, which
-- bypasses RLS. Mistakes are corrected with a new `adjustments` row, never by
-- mutating a `payments` row.

create table properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) default auth.uid(),
  name text not null,
  address text,
  type text not null check (type in ('residential', 'commercial')),
  created_at timestamptz not null default now()
);

create table tenants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) default auth.uid(),
  property_id uuid not null references properties (id) on delete restrict,
  name text not null,
  phone text not null,
  unit_label text,
  preferred_channel text not null default 'both' check (preferred_channel in ('whatsapp', 'sms', 'both')),
  monthly_rent_amount numeric(12, 2) not null check (monthly_rent_amount > 0),
  lease_start date not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create index tenants_property_id_idx on tenants (property_id);

-- One row per tenant per calendar month of rent owed. Rows are created ahead of
-- time (see ensureRentPeriods) so arrears are visible even for months the owner
-- never manually logged. amount_allocated is only ever written by trusted server
-- code as payments/adjustments are confirmed against this period.
create table rent_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete restrict,
  period_month date not null,
  amount_due numeric(12, 2) not null check (amount_due > 0),
  amount_allocated numeric(12, 2) not null default 0 check (amount_allocated >= 0),
  status text generated always as (
    case
      when amount_allocated <= 0 then 'pending'
      when amount_allocated < amount_due then 'partially_paid'
      else 'paid'
    end
  ) stored,
  created_at timestamptz not null default now(),
  unique (tenant_id, period_month)
);

create index rent_periods_tenant_id_idx on rent_periods (tenant_id);

-- One row per real-world payment event. May settle one or several rent_periods
-- (see payment_allocations) to support tenants paying multiple months at once.
create table payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) default auth.uid(),
  tenant_id uuid not null references tenants (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  payment_date date not null,
  mode text not null check (mode in ('cash', 'bank_transfer', 'upi', 'cheque', 'other')),
  note text,
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  owner_signature_path text,
  tenant_signature_path text,
  otp_verified_at timestamptz,
  pdf_path text,
  token_hash text not null unique,
  token_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index payments_tenant_id_idx on payments (tenant_id);
create index payments_token_hash_idx on payments (token_hash);

create table payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments (id) on delete restrict,
  rent_period_id uuid not null references rent_periods (id) on delete restrict,
  amount_allocated numeric(12, 2) not null check (amount_allocated > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, rent_period_id)
);

create index payment_allocations_payment_id_idx on payment_allocations (payment_id);
create index payment_allocations_rent_period_id_idx on payment_allocations (rent_period_id);

-- A correction against an existing payment. Never edits the original payment row;
-- goes through the same tenant sign + OTP flow before its delta_amount is applied
-- to the referenced rent_periods.
create table adjustments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) default auth.uid(),
  tenant_id uuid not null references tenants (id) on delete restrict,
  original_payment_id uuid not null references payments (id) on delete restrict,
  delta_amount numeric(12, 2) not null check (delta_amount <> 0),
  reason text not null check (char_length(reason) > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  owner_signature_path text,
  tenant_signature_path text,
  otp_verified_at timestamptz,
  pdf_path text,
  token_hash text not null unique,
  token_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index adjustments_tenant_id_idx on adjustments (tenant_id);
create index adjustments_original_payment_id_idx on adjustments (original_payment_id);
create index adjustments_token_hash_idx on adjustments (token_hash);

create table adjustment_allocations (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references adjustments (id) on delete restrict,
  rent_period_id uuid not null references rent_periods (id) on delete restrict,
  amount_delta numeric(12, 2) not null check (amount_delta <> 0),
  created_at timestamptz not null default now(),
  unique (adjustment_id, rent_period_id)
);

create index adjustment_allocations_adjustment_id_idx on adjustment_allocations (adjustment_id);
create index adjustment_allocations_rent_period_id_idx on adjustment_allocations (rent_period_id);

-- Row Level Security ---------------------------------------------------------

alter table properties enable row level security;
alter table tenants enable row level security;
alter table rent_periods enable row level security;
alter table payments enable row level security;
alter table payment_allocations enable row level security;
alter table adjustments enable row level security;
alter table adjustment_allocations enable row level security;

-- Properties & tenants: normal owner-scoped CRUD. These aren't ledger rows -
-- fixing a typo'd tenant name or property address isn't a financial correction.
create policy "owner manages own properties" on properties
  for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner manages own tenants" on tenants
  for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- rent_periods: owner can read; only server code (service role, via
-- ensureRentPeriods / payment confirmation) creates or updates rows.
create policy "owner reads own rent periods" on rent_periods
  for select
  to authenticated
  using (
    exists (
      select 1 from tenants
      where tenants.id = rent_periods.tenant_id
        and tenants.owner_id = (select auth.uid())
    )
  );

-- payments: owner can read and create (status always starts 'pending' via
-- column default). The financial facts (amount, date, mode, signatures,
-- status, ...) are never updatable by authenticated - grants below revoke
-- UPDATE entirely and then re-grant it for exactly two operational (non-
-- financial) columns, so a lost/expired share link can be rotated without
-- opening a path to edit the ledger itself.
create policy "owner reads own payments" on payments
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "owner creates payments" on payments
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending');

create policy "owner rotates share link on own pending payments" on payments
  for update
  to authenticated
  using (owner_id = (select auth.uid()) and status = 'pending')
  with check (owner_id = (select auth.uid()) and status = 'pending');

create policy "owner reads own payment allocations" on payment_allocations
  for select
  to authenticated
  using (
    exists (
      select 1 from payments
      where payments.id = payment_allocations.payment_id
        and payments.owner_id = (select auth.uid())
    )
  );

create policy "owner creates payment allocations" on payment_allocations
  for insert
  to authenticated
  with check (
    exists (
      select 1 from payments
      where payments.id = payment_allocations.payment_id
        and payments.owner_id = (select auth.uid())
        and payments.status = 'pending'
    )
  );

create policy "owner reads own adjustments" on adjustments
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "owner creates adjustments" on adjustments
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending');

create policy "owner rotates share link on own pending adjustments" on adjustments
  for update
  to authenticated
  using (owner_id = (select auth.uid()) and status = 'pending')
  with check (owner_id = (select auth.uid()) and status = 'pending');

create policy "owner reads own adjustment allocations" on adjustment_allocations
  for select
  to authenticated
  using (
    exists (
      select 1 from adjustments
      where adjustments.id = adjustment_allocations.adjustment_id
        and adjustments.owner_id = (select auth.uid())
    )
  );

create policy "owner creates adjustment allocations" on adjustment_allocations
  for insert
  to authenticated
  with check (
    exists (
      select 1 from adjustments
      where adjustments.id = adjustment_allocations.adjustment_id
        and adjustments.owner_id = (select auth.uid())
        and adjustments.status = 'pending'
    )
  );

-- Grants ----------------------------------------------------------------------
-- Belt-and-braces on top of RLS: the app-facing roles can never issue an
-- UPDATE or DELETE against the ledger tables, full stop. The service role used
-- by trusted server code bypasses RLS and grants entirely, so this has no
-- effect on the payment/adjustment confirmation path.

revoke update, delete on rent_periods from authenticated, anon;
revoke update, delete on payments from authenticated, anon;
revoke update, delete on payment_allocations from authenticated, anon;
revoke update, delete on adjustments from authenticated, anon;
revoke update, delete on adjustment_allocations from authenticated, anon;

-- Narrow re-grant: only these two operational columns, only on rows the
-- "owner rotates share link on own pending ..." policies above already scope
-- to the requesting owner's own pending rows.
grant update (token_hash, token_expires_at) on payments to authenticated;
grant update (token_hash, token_expires_at) on adjustments to authenticated;

revoke all on rent_periods from anon;
revoke all on payments from anon;
revoke all on payment_allocations from anon;
revoke all on adjustments from anon;
revoke all on adjustment_allocations from anon;
revoke all on properties from anon;
revoke all on tenants from anon;
