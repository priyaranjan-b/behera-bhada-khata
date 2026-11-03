-- Payment tags (D34 in docs/database-design.md).
--
-- The owner marks payments with short labels, starting with who collected
-- the money. Two tables:
--
-- 1. payment_tags: the names offered as suggestions, seeded with the people
--    who collect rent; a name typed on the fly while tagging a payment joins
--    it. Managed on the Profile page.
-- 2. payment_record_tags: the tags a payment carries, each its own copy of
--    the name (as a payment copies its note, D30). Renaming or removing a
--    suggestion never changes a payment: "Padma" stays on what Padma
--    collected. The owner adds and removes them on existing payments (the
--    Payments page). They're the owner's labels, not ledger facts, so unlike
--    payments (append-only, D4) they may change, and create_payment is
--    untouched: the adapter writes a new payment's tags in the same
--    transaction.
--
-- Neither table is audited (like payment_note_presets, D30): a tag never
-- moves money.

create table payment_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One of each, whatever the case.
create unique index payment_tags_name_key on payment_tags (lower(name));

comment on table payment_tags is
  'Labels the owner puts on payments (who collected it, ...); managed on the Profile page.';

create trigger payment_tags_updated_at before update on payment_tags
  for each row execute function set_updated_at();

alter table payment_tags enable row level security;

create policy "owner reads payment tags" on payment_tags
  for select to authenticated using (is_app_owner());
create policy "owner adds payment tags" on payment_tags
  for insert to authenticated with check (is_app_owner());
create policy "owner edits payment tags" on payment_tags
  for update to authenticated using (is_app_owner()) with check (is_app_owner());
create policy "owner deletes payment tags" on payment_tags
  for delete to authenticated using (is_app_owner());

revoke all on payment_tags from anon;
revoke truncate on payment_tags from authenticated;

insert into payment_tags (name) values
  ('Priyaranjan'),
  ('Sankarshan'),
  ('Padma'),
  ('RameshSutar'),
  ('Malati');

create table payment_record_tags (
  payment_id uuid not null references payments (id) on update restrict on delete restrict,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (payment_id, name)
);

-- One of each on a payment, whatever the case.
create unique index payment_record_tags_name_key on payment_record_tags (payment_id, lower(name));

comment on table payment_record_tags is
  'The tags on a payment, each a copy of the name; added and removed by the owner, never updated.';

alter table payment_record_tags enable row level security;

create policy "owner reads payment record tags" on payment_record_tags
  for select to authenticated using (is_app_owner());
create policy "owner adds payment record tags" on payment_record_tags
  for insert to authenticated with check (is_app_owner());
create policy "owner removes payment record tags" on payment_record_tags
  for delete to authenticated using (is_app_owner());

revoke all on payment_record_tags from anon;
revoke update, truncate on payment_record_tags from authenticated;
