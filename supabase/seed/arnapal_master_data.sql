-- Registers the owner of this rent book, then loads the master data from
-- "Arnapal Tenet House Number.xlsx": 2 sites, 7 towers, 40 houses.
-- Run once (SQL Editor or psql) after the migrations, as the database owner,
-- then supabase/seed/arnapal_tenants.sql.
-- Idempotent: rows that already exist are left as they are.
--
-- 1. Put the email you sign in to the app with here (sign in once first, so
--    the account exists):
select set_config('seed.owner_email', 'OWNER@EXAMPLE.COM', false);

-- 2. Run the whole file.
do $$
declare
  v_owner uuid;
begin
  select id into v_owner from auth.users where lower(email) = lower(current_setting('seed.owner_email'));
  if v_owner is null then
    raise exception 'No user with email % - sign in to the app once first, then set seed.owner_email above.',
      current_setting('seed.owner_email');
  end if;

  -- The one account allowed in (see 0003_single_owner.sql). Never silently
  -- replaced: changing the owner is a deliberate UPDATE of app_owner.
  insert into app_owner (user_id) values (v_owner) on conflict (singleton) do nothing;
  if not exists (select 1 from app_owner where user_id = v_owner) then
    raise exception 'A different account already owns this rent book; update app_owner deliberately if that is intended.';
  end if;

  insert into locations (location_code, name) values
    ('AC', 'Arnapal Chakk Complex'),
    ('RM', 'Ram Mandir Factory')
  on conflict (location_code) do nothing;

  insert into properties (property_code, location_code, name) values
    ('AC-T1', 'AC', 'Tower 1'),
    ('AC-T2', 'AC', 'Tower 2'),
    ('RM-T1', 'RM', 'Post Office House'),
    ('RM-T2', 'RM', 'Electric Office House'),
    ('RM-T3', 'RM', 'Telephone Office Tower'),
    ('RM-TW', 'RM', 'Factory House / Godown'),
    ('RM-TS', 'RM', 'Mati Ghara')
  on conflict (property_code) do nothing;

  -- Houses are master data only. Who occupies them is in arnapal_tenants.sql.
  insert into units (unit_code, property_code, floor, unit_type, label) values
    ('AC-T1-G01', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-G02', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-G03', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-G04', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-G05', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-G06', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-G07', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-G08', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-G09', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-G10', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-G11', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-G12', 'AC-T1', 'G', 'commercial', null),
    ('AC-T1-101', 'AC-T1', '1', 'commercial', null),
    ('AC-T1-102', 'AC-T1', '1', 'commercial', null),
    ('AC-T1-103', 'AC-T1', '1', 'commercial', null),
    ('AC-T1-104', 'AC-T1', '1', 'commercial', null),
    ('AC-T1-105', 'AC-T1', '1', 'residential', 'Cabin Room'),
    ('AC-T1-106', 'AC-T1', '1', 'residential', 'Family Room 1'),
    ('AC-T1-107', 'AC-T1', '1', 'residential', 'Family Room 2'),

    ('AC-T2-G01', 'AC-T2', 'G', 'commercial', 'Godown'),
    ('AC-T2-101', 'AC-T2', '1', 'commercial', 'Godown'),

    ('RM-T1-G01', 'RM-T1', 'G', 'commercial', null),
    ('RM-T1-G02', 'RM-T1', 'G', 'commercial', null),
    ('RM-T1-101', 'RM-T1', '1', 'residential', null),
    ('RM-T1-102', 'RM-T1', '1', 'residential', null),

    ('RM-T2-G01', 'RM-T2', 'G', 'residential', 'Cabin Room'),
    ('RM-T2-G02', 'RM-T2', 'G', 'residential', null),
    ('RM-T2-G03', 'RM-T2', 'G', 'commercial', null),
    ('RM-T2-G04', 'RM-T2', 'G', 'commercial', null),
    ('RM-T2-101', 'RM-T2', '1', 'residential', null),
    ('RM-T2-102', 'RM-T2', '1', 'residential', null),

    ('RM-T3-G01', 'RM-T3', 'G', 'commercial', null),
    ('RM-T3-101', 'RM-T3', '1', 'residential', null),
    ('RM-T3-201', 'RM-T3', '2', 'residential', null),

    ('RM-TW-G01', 'RM-TW', 'G', 'commercial', 'Partition'),
    ('RM-TW-G02', 'RM-TW', 'G', 'commercial', 'Godown'),
    ('RM-TW-G03', 'RM-TW', 'G', 'commercial', 'Godown'),
    ('RM-TW-G04', 'RM-TW', 'G', 'commercial', 'Partition'),

    ('RM-TS-01', 'RM-TS', null, 'residential', null),
    ('RM-TS-02', 'RM-TS', null, 'commercial', null)
  on conflict (unit_code) do nothing;
end;
$$;
