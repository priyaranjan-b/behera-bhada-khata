-- A ceiling on how long one query may run (A17).
--
-- The publishable (anon) key is public, so anyone can call PostgREST
-- directly. RLS keeps them from seeing anything, but a slow query still costs
-- the database. Supabase's defaults are anon 3s and authenticated 8s; the
-- owner's heaviest read (a billing page over 24 months) takes well under a
-- second, so 5s leaves room and caps a runaway or abusive request sooner.
-- It applies to new connections; PostgREST picks it up on its next reload.

alter role authenticated set statement_timeout = '5s';
alter role anon set statement_timeout = '3s';
