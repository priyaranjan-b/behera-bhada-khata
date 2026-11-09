-- Where an SMS code's provider reference waits for the check (A34, D38 in docs/database-design.md).
--
-- Twilio Verify checks a code by phone number alone. 2Factor (the cheaper
-- Indian provider, OTP_PROVIDER=twofactor) hands back a session id when it
-- sends the code and checks the code against that id, so the id has to wait
-- here between "send code" and "check code" - across requests and server
-- instances. One row per phone: a new code replaces the last one's id.
--   * `key` is a keyed hash of the phone (keyedHash in src/server/token.ts),
--     never the number;
--   * the reference alone can't check a code (it needs the API key);
--   * rows expire with the code, are deleted once it matches, and the daily
--     cron drops the expired ones.
-- Service role only.

create table otp_sessions (
  key text primary key,
  reference text not null check (char_length(reference) between 1 and 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint otp_sessions_expiry check (expires_at > created_at)
);

create index otp_sessions_expires_at_idx on otp_sessions (expires_at);

comment on table otp_sessions is
  'An SMS code''s provider reference between sending and checking it, keyed by a keyed hash of the phone (A34, D38). Service role only.';

alter table otp_sessions enable row level security;
revoke all on otp_sessions from public, anon, authenticated;
grant select, insert, update, delete on otp_sessions to service_role;
