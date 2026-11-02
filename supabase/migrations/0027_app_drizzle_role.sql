-- The Drizzle adapter's own database login (A19, D32 in docs/database-design.md).
--
-- The Drizzle adapter connects straight to Postgres (Supabase's transaction
-- pooler), which takes a role and password, not an API key. The dashboard's
-- connection string uses `postgres`, which can change the schema; this role
-- can do nothing of its own:
--   * NOINHERIT and no grants beyond PUBLIC (which every function's
--     migration keeps empty, D11), so a connection that hasn't switched role
--     can't read or write anything;
--   * a member of authenticated only, so it can switch to the owner role for
--     one transaction. inScope() in src/server/adapters/drizzle/client.ts
--     does exactly that with the session's verified user id, so RLS,
--     is_app_owner() and the function grants apply as they do for the
--     Supabase clients. service_role (which bypasses RLS) is granted by the
--     migration that first moves a system method to Drizzle, not before.
-- It is created without a password, so it can't log in until the owner sets
-- one by hand in the SQL editor (never in a migration or in git):
--   alter role app_drizzle password '<long random password>';
-- Then DATABASE_URL uses the user app_drizzle.<project-ref> on port 6543.
-- Treat that URL like SUPABASE_SECRET_KEY: to rotate it, run the alter role
-- again and update DATABASE_URL wherever it is set.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_drizzle') then
    create role app_drizzle login noinherit;
  end if;
end
$$;

-- SUPERUSER, REPLICATION and BYPASSRLS can only be named (even to turn them
-- off) by a superuser, and Supabase's postgres isn't one, so a role it
-- created can't have them. Check instead of setting, for a role made earlier.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_drizzle' and (rolsuper or rolreplication or rolbypassrls)) then
    raise exception 'app_drizzle has SUPERUSER, REPLICATION or BYPASSRLS, which only a superuser can remove'
      using hint = 'Run "drop role app_drizzle;" and run this migration again (then set its password and update DATABASE_URL), or ask Supabase support to remove the attribute.';
  end if;
end
$$;

-- The same end state however the role started (e.g. made by hand earlier).
alter role app_drizzle login noinherit nocreatedb nocreaterole;
-- A backstop for the statement before inScope() switches role and sets its own timeout (A17).
alter role app_drizzle set statement_timeout = '5s';

grant authenticated to app_drizzle;
revoke service_role from app_drizzle;
