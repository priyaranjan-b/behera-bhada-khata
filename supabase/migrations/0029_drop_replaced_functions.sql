-- Drop the SQL functions the Drizzle adapter replaced (A19, D33 in
-- docs/database-design.md).
--
-- Since the release that made Drizzle the only data adapter, the app builds
-- these reads in TypeScript (src/server/adapters/drizzle/queries/, grid/,
-- tables/rateLimits.ts) and never calls the functions below: the paged
-- tables (D28), the account figures (D29), their grid and label helpers,
-- and the rate-limit counter (D12). Nothing that stays calls them either
-- (triggers, audit_describe, log_event, the ledger and tenant functions,
-- ensure_rent_periods, views, RLS policies).
--
-- allocation_rows (0020) stays: create_payment and create_adjustment use it.
--
-- WHEN TO RUN IT (production is migrated by hand, A1). All three must hold:
--   1. Vercel's current production deployment is commit 24be8bd (the
--      Drizzle-only release) or later, and every older deployment is one
--      you will never promote or "instant rollback" to. An older release
--      calls these functions: after 0029 its owner pages, rate limits and
--      cron would all fail (rate limits fail closed, A17).
--   2. It has run cleanly for a few days, daily cron included.
--   3. No job of your own calls them. Check before running (if the `cron`
--      schema exists):
--        select jobid, jobname, command from cron.job
--        where command ~* '(hit_rate_limit|prune_rate_limits|_page|_totals|tenant_account_summary)[[:space:]]*[(]';
--      It must return no rows.
--
-- AFTER RUNNING, this must return no rows:
--   select oid::regprocedure from pg_proc
--   where pronamespace = 'public'::regnamespace and proname = any(array[
--     'payments_page','payments_matching','payments_rows','billing_page','billing_totals',
--     'billing_matching','billing_rows','tenant_ledger_page','tenant_ledger_matching',
--     'tenant_ledger_rows','tenant_months_page','tenant_months_matching','tenant_month_rows',
--     'audit_history_page','audit_matches','audit_field','grid_check','grid_row_matches',
--     'grid_words','grid_active_filters','audit_text_matches','like_escape',
--     'period_display_status','status_label','payment_mode_label','tenant_placement_now',
--     'tenant_account_summary','app_current_month','hit_rate_limit','prune_rate_limits']);
--
-- UNDO: run supabase/rollback/0029_restore_replaced_functions.sql
-- in the SQL editor. It re-creates all 30 exactly as 0028 left them, grants
-- included (test/schema.test.ts checks that), and is also the tests' frozen
-- reference copy.
--
-- Callers before what they call. "if exists" makes it safe to run again;
-- test/schema.test.ts checks every one is gone, so a wrong signature can't
-- slip through on a database built from the migrations.

begin;

drop function if exists payments_page(date,date,text,jsonb,text,text,text,integer,integer);
drop function if exists payments_matching(date,date,text[],jsonb,text);
drop function if exists payments_rows(date,date);
drop function if exists billing_page(date,date,boolean,text,text,jsonb,text,text,text,integer,integer);
drop function if exists billing_totals(date,date,boolean);
drop function if exists billing_matching(date,date,boolean,text,text[],jsonb,text);
drop function if exists billing_rows(date,date,boolean);
drop function if exists tenant_ledger_page(uuid,date,date,text,jsonb,text,text,text,integer,integer);
drop function if exists tenant_ledger_matching(uuid,date,date,text[],jsonb,text);
drop function if exists tenant_ledger_rows(uuid);
drop function if exists tenant_months_page(uuid,text,text,jsonb,text,text,text,integer,integer);
drop function if exists tenant_months_matching(uuid,text,text[],jsonb,text);
drop function if exists tenant_month_rows(uuid);
drop function if exists audit_history_page(uuid,text[],date,date,text,jsonb,text,text,text,integer,integer);
drop function if exists audit_matches(audit_log,text,text[],date,date,text[],jsonb,text);
drop function if exists audit_field(audit_log,text,text);
drop function if exists grid_check(text,text[],text,text,integer,integer,jsonb,text[]);
drop function if exists grid_row_matches(jsonb,text,text[],jsonb,text);
drop function if exists grid_words(text);
drop function if exists grid_active_filters(jsonb);
drop function if exists audit_text_matches(text,text,text);
drop function if exists like_escape(text);
drop function if exists period_display_status(date,text);
drop function if exists status_label(text);
drop function if exists payment_mode_label(text);
drop function if exists tenant_placement_now(uuid);
drop function if exists tenant_account_summary(uuid);
drop function if exists app_current_month();
drop function if exists hit_rate_limit(text,integer,integer);
drop function if exists prune_rate_limits();

commit;
