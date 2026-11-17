-- Opens corrections PIN setup for 15 minutes (0039, D41): run it once after
-- deploying 0039 to set the first PIN, and again whenever the PIN is
-- forgotten or locked for 24 hours. It clears the current PIN, any lockout
-- and any ticket; the owner then sets a new PIN on Profile within 15
-- minutes. Until they do, no correction can be saved.
--
-- Run by hand in the Supabase SQL Editor. That needs the Supabase dashboard
-- login, which a stolen app session doesn't have: this is why the app can't
-- set a first PIN by itself. The PIN never goes in this script, so it never
-- lands in the editor's history. Not a migration.

begin;

delete from correction_tickets;

insert into correction_guard (singleton, setup_until)
values (true, now() + interval '15 minutes')
on conflict (singleton) do update
set pin_hash = null,
    pin_salt = null,
    pin_set_at = null,
    setup_until = excluded.setup_until,
    failed_attempts = 0,
    failures_today = 0,
    failures_day = null,
    locked_until = null;

-- In the audit log as the system ("Corrections PIN setup opened").
select log_correction_event('correction_pin.setup_opened', null, 'Open for 15 minutes');

commit;
