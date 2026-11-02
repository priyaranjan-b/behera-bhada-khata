-- The Drizzle login may act as service_role (A19, D32 in docs/database-design.md).
--
-- 0027 made app_drizzle a member of authenticated only, and left service_role
-- (which bypasses RLS) for the migration that first moves a system method to
-- the Drizzle adapter. That is now the rate limits (hit_rate_limit /
-- prune_rate_limits, D12): every owner API call and the public OTP, confirm
-- and magic-link endpoints count a hit through systemDb().rateLimits.
--
-- The membership never inherits (with inherit false, whatever the role's
-- attribute), so app_drizzle still can't read or run anything until
-- inScope() switches role for one transaction; inScope switches to
-- service_role only for systemDb() (src/server/adapters/drizzle/client.ts).
-- Needs Postgres 16+ for the options (Supabase runs 17).
--
-- Run it before using DATA_ADAPTER=drizzle with this release: without it the
-- rate limit (so every owner API call) fails, and the log says to run 0028.
-- Safe to run again, and a re-run also corrects a membership granted with
-- other options. Re-running 0027 revokes this grant: run 0028 after it.

grant service_role to app_drizzle with inherit false, set true;
