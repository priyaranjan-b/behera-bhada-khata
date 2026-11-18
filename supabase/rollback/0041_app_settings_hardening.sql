-- Undoes 0041_app_settings_hardening.sql: tenants may read the whole
-- app_settings row again (as 0040 left it). Run by hand in the SQL Editor.
-- Not a migration.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'tenant_reader') then
    execute 'revoke select (date_format) on app_settings from tenant_reader';
    execute 'grant select on app_settings to tenant_reader';
  end if;
end $$;
