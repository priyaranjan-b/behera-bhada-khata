-- app_settings: tenants read only the date format (D42, issue #17).
--
-- 0040 let tenant_reader select the whole row (policy `using (true)`). The
-- row holds only date_format today, but a column added later would be
-- readable by every signed-in tenant. A column grant is the guard: a new
-- column stays hidden from tenants unless a migration grants it.
-- Needs 0040 (the table). Safe to run again.
-- Undo: supabase/rollback/0041_app_settings_hardening.sql.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tenant_reader') then
    execute 'revoke select on app_settings from tenant_reader';
    execute 'grant select (date_format) on app_settings to tenant_reader';
  else
    raise notice '0041: no tenant_reader role (0033 not applied?) - nothing to narrow';
  end if;
end $$;

comment on column app_settings.date_format is
  'How the UI shows dates (dayjs tokens, DISPLAY_DATE_FORMATS). The only column tenant_reader may read (0041): grant a new one explicitly if tenants need it.';
