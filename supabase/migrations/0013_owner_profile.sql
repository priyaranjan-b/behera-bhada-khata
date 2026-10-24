-- Owner master data (D23 in docs/database-design.md).
--
-- The rent book's owner had no name anywhere: receipts printed the login
-- email. owner_profile holds the owner's first and last name, the name
-- printed under the signature when someone else signs receipts on the
-- owner's behalf (e.g. a son who collects the rent and uses the login), and
-- that signer's saved signature.
--
-- One row, like app_owner, and keyed the same way: it describes the rent
-- book's owner, not a login account, so it stays put if ownership is ever
-- moved to another account with an UPDATE of app_owner.

create table owner_profile (
  singleton boolean primary key default true check (singleton)
    references app_owner (singleton) on update restrict on delete cascade,
  first_name text not null check (first_name = btrim(first_name) and char_length(first_name) between 1 and 60),
  last_name text check (last_name is null or (last_name = btrim(last_name) and char_length(last_name) between 1 and 60)),
  -- Printed under the landlord's signature on receipts; null = the owner's own name.
  signature_name text check (
    signature_name is null or (signature_name = btrim(signature_name) and char_length(signature_name) between 1 and 120)
  ),
  -- The signer's saved signature (a PNG in the private bucket). When set, new
  -- payments and adjustments can use it instead of a hand-drawn one; each
  -- record still stores its own copy, so replacing it never changes old receipts.
  signature_path text check (signature_path is null or signature_path like 'owner/%.png'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table owner_profile is 'The rent book owner''s name (one row); edited on the Profile page.';
comment on column owner_profile.signature_name is
  'Name under the landlord signature on receipts, when it isn''t the owner (null = owner''s name).';

create trigger owner_profile_updated_at before update on owner_profile
  for each row execute function set_updated_at();

alter table owner_profile enable row level security;

-- A single-row write needs no SQL function (D5): the owner inserts the row
-- once and edits it after; nobody deletes it.
create policy "owner reads profile" on owner_profile
  for select to authenticated using (is_app_owner());
create policy "owner creates profile" on owner_profile
  for insert to authenticated with check (is_app_owner());
create policy "owner edits profile" on owner_profile
  for update to authenticated using (is_app_owner()) with check (is_app_owner());

revoke all on owner_profile from anon;
revoke delete, truncate on owner_profile from authenticated;
