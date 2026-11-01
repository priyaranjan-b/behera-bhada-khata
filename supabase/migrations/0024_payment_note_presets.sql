-- Quick payment notes and dd/MM/yyyy dates (D30 in docs/database-design.md).
--
-- 1. payment_note_presets: short notes the owner picks from when recording a
--    payment ("Paid via UPI", "Advance rent"); the note field still takes any
--    text. Edited on the Profile page. Plain master data: the note a payment
--    keeps is copied into payments.note, so editing or deleting a preset never
--    changes a payment, and the table needs no audit trigger.
-- 2. audit_date writes dates as dd/MM/yyyy, matching DATE_FORMAT in
--    src/lib/dates.ts (formatDateKey). Audit rows already stored keep their
--    text (D27).

create table payment_note_presets (
  id uuid primary key default gen_random_uuid(),
  text text not null check (text = btrim(text) and char_length(text) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One of each, whatever the case.
create unique index payment_note_presets_text_key on payment_note_presets (lower(text));

comment on table payment_note_presets is
  'Quick-select notes for the Record payment form; edited on the Profile page.';

create trigger payment_note_presets_updated_at before update on payment_note_presets
  for each row execute function set_updated_at();

alter table payment_note_presets enable row level security;

-- Single-row writes need no SQL function (D5).
create policy "owner reads payment note presets" on payment_note_presets
  for select to authenticated using (is_app_owner());
create policy "owner adds payment note presets" on payment_note_presets
  for insert to authenticated with check (is_app_owner());
create policy "owner edits payment note presets" on payment_note_presets
  for update to authenticated using (is_app_owner()) with check (is_app_owner());
create policy "owner deletes payment note presets" on payment_note_presets
  for delete to authenticated using (is_app_owner());

revoke all on payment_note_presets from anon;
revoke truncate on payment_note_presets from authenticated;

insert into payment_note_presets (text) values
  ('Advance rent'),
  ('Includes previous dues'),
  ('Paid in cash'),
  ('Paid via UPI'),
  ('Partial payment');

-- 04/10/2026, as formatDateKey; test/schema.test.ts keeps them equal.
create or replace function audit_date(p_date date)
returns text
language sql
immutable
set search_path = public
as $$
  select to_char(p_date, 'DD/MM/YYYY')
$$;
