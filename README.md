# Behera Bhada Khata (ବେହେରା ଭଡ଼ା ଖାତା)

A small digital version of a landlord's rent book: record a rent payment,
send the tenant a link over WhatsApp/SMS, they draw a signature and verify an
SMS OTP, and a signed PDF receipt is generated for both sides. Payments and
corrections are append-only - see `supabase/migrations/0001_init.sql` for the
ledger design.

Stack: Next.js (App Router) on Vercel, Postgres/Auth/Storage on Supabase,
Twilio for SMS OTP + WhatsApp/SMS delivery.

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (the free tier is
   enough for this scale).
2. **Run the schema**: `supabase db push` with the Supabase CLI, or Project →
   SQL Editor → paste and run each file in `supabase/migrations/` **in
   order** (`0001` … `0007`): `0003` single owner (`app_owner`), `0004`
   transactional ledger functions and rate limiting, `0005` the private
   `rent-register` storage bucket, `0006` the site → tower → house master
   data and dated tenancies, `0007` draft tenants. The design and its reasons are in
   `docs/database-design.md`.
   - `0029` drops SQL functions that older releases of the app call. A new
     project runs it with the rest. On a database already in use, hold it
     back until the steps in its header are met (D33), and undo it with
     `supabase/rollback/0029_restore_replaced_functions.sql`.
   - `0006` refuses to run if properties or tenants already exist. On a
     project with only **test data**, first run
     `supabase/scripts/reset_owner_data.sql` (it deletes every property,
     tenant and payment).
   - **Claim ownership and load the master data:** sign in to the app once
     (so your account exists), put your email on the first line of
     `supabase/seed/arnapal_master_data.sql`, and run it in the SQL Editor. It
     registers you as the one owner (`app_owner`) and creates the 2 sites, 7
     towers and 40 houses from the paper register. Then run
     `supabase/seed/arnapal_tenants.sql` (local only - it holds real occupant
     names, so it's gitignored and not in the repo), which adds the register's
     26 occupants as **draft** tenants on their houses. Open each one in the app
     and use Edit to add the phone, combined monthly rent and lease start; that
     makes it active and starts billing. Both seeds are safe to re-run.
     Until an owner is registered the database shows nobody anything; to hand
     the rent book to another account later, update the `app_owner` row by
     hand.
3. **Storage**: nothing to click - `0005_storage.sql` creates the bucket
   (private, PNG/PDF only, 2 MB per file). The app only reads/writes it with
   the server-side secret key and mints short-lived signed URLs.
4. **Get your API keys**: Project Settings → API.
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable (or "anon") key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Secret (or "service_role") key → `SUPABASE_SECRET_KEY` (never expose
     this to the browser)
5. **Database login for the app** (`DATABASE_URL`, required): every read
   and write goes straight to Postgres as the `app_drizzle` role, which
   migrations 0027 and 0028 create (D32 in `docs/database-design.md`). Give
   it a password once in the SQL Editor:
   `alter role app_drizzle password '<long random>';` (never commit it).
   Then Connect → the "ORM" tab → Drizzle (or "Transaction pooler"): copy the
   shared pooler string on port 6543 and change the user from
   `postgres.<ref>` to `app_drizzle.<ref>`, with that password →
   `DATABASE_URL`. Server-only: never a `NEXT_PUBLIC_` variable. Details are
   in `.env.local.example`.
6. **Enable email sign-in**: Authentication → Providers → Email should
   already be on by default, with password sign-in allowed (the app offers
   both a password and an email magic link). Authentication → URL Configuration → add your
   app URL (and `http://localhost:3000` for local dev) to the redirect
   allow-list, since the login flow redirects to `/auth/callback`.

## 2. Twilio setup (optional - tenant messages only)

The owner never needs Twilio to sign in. Without it the app still works:
payments count, receipts download, and the "send to tenant" step shows as
"not delivered". Add it whenever you're ready; no code change is needed.

1. Create an account at [twilio.com](https://twilio.com) and grab your
   **Account SID** and **Auth Token** from the console → `TWILIO_ACCOUNT_SID`
   / `TWILIO_AUTH_TOKEN`.
2. **Verify service (for OTP)**: Console → Verify → Services → create one →
   copy its SID → `TWILIO_VERIFY_SERVICE_SID`. It also sends the tenant
   portal's sign-in codes (`/tenant/login`, A32): under the service's **Geo
   permissions**, allow India (+91) only, so nobody can use the sign-in page
   to text premium numbers abroad. Locally without Twilio, `ALLOW_DEV_LOGIN=1`
   makes the tenant code `000000`.
3. **SMS sender**: buy/use a Twilio phone number capable of sending SMS →
   `TWILIO_SMS_FROM` (E.164 format, e.g. `+14155551234`).
4. **WhatsApp sender**: for testing, join the [Twilio WhatsApp
   sandbox](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn)
   and use its sandbox number (`whatsapp:+14155238886` by default) as
   `TWILIO_WHATSAPP_FROM` - each tenant needs to send the sandbox join code
   once. For production, apply for a WhatsApp Business Platform sender
   through Twilio (takes Meta approval) and use that number instead.

### Cheaper SMS codes in India: 2Factor (optional)

Twilio Verify charges a fee per verification on top of the SMS. For tenant
sign-in codes in India, 2Factor costs about ₹0.16 per delivered code (failed
ones are free, no monthly minimum), so ~500 codes a month is roughly ₹80 (A34).
Links over WhatsApp/SMS stay on Twilio.

1. Sign up at [2factor.in](https://2factor.in), top up the prepaid wallet and
   copy the **API key** → `TWOFACTOR_API_KEY`.
2. In the 2Factor dashboard, get your **OTP SMS template** approved on DLT
   (2Factor files it for you; Indian SMS must use a DLT-registered template).
   Put its name in `TWOFACTOR_OTP_TEMPLATE`, or leave it empty for 2Factor's
   default.
3. Set `OTP_PROVIDER=twofactor` and restart. Run migration
   `0035_otp_sessions.sql` first: it keeps 2Factor's session id between
   "send code" and "check code".

## 3. Configure and run

```bash
cp .env.local.example .env.local
# fill in the values from steps 1-2 (including DATABASE_URL), plus:
#   NEXT_PUBLIC_APP_URL   - http://localhost:3000 for now
#   OWNER_EMAILS          - your email, so you can create your owner account
#   ALLOW_DEV_LOGIN=1     - optional: show the sign-in link on screen instead of emailing it

npm install
npm run dev
```

Open `http://localhost:3000`, sign in with the **Email link** tab, then go
to Profile → Password and set a password - from then on the **Password** tab
signs you in without email. Then add a property, a tenant, and record a
payment.

Every variable is validated when the server starts (`src/server/env.ts`).
Twilio may be left empty anywhere (messages then show as "not delivered";
a production server logs a warning). `CRON_SECRET` may be empty in
development - the cron endpoint then stays locked - but is required in
production.

**Who can sign in:** with `OWNER_EMAILS` set, only those emails (and they may
create their account on first sign-in). Without it, only accounts that
already exist in Supabase Auth can sign in; nobody can sign up by typing an
email.

### Checks

```bash
npm run lint
npm run typecheck
npm test        # unit + service tests, and every migration run against an in-process Postgres
npm run build
```

CI (`.github/workflows/ci.yml`) runs the same on every push and pull request.

## 4. Deploying (Vercel)

1. **Supabase**: migrations and seeds run (step 1), and the owner row is in
   `app_owner`. Under Authentication → URL Configuration set the Site URL to
   the production URL and add `https://<your-app>.vercel.app/auth/callback`
   to the redirect allow-list.
2. **Owner password**: sign in once with the email link and set it on
   Profile → Password, or set it in Supabase under Authentication → Users →
   the owner. The Password tab then works without any email.
3. Push this repo to GitHub and import it into [Vercel](https://vercel.com).
   Under Settings → Environment Variables (Production) set
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `DATABASE_URL` (step 1.5: the `app_drizzle`
   login on the transaction pooler, port 6543), `NEXT_PUBLIC_APP_URL` (the
   production URL),
   `OWNER_EMAILS` and a `CRON_SECRET` of 16+ random characters (the server
   refuses to start without either). The build doesn't check these, so a
   missing or wrong `DATABASE_URL` shows up only as a 500 on the first page:
   run the smoke test below after every change to it. Twilio may stay unset
   for now. Don't set
   `ALLOW_DEV_LOGIN` - it is ignored in production anyway.
4. Deploy. `vercel.json` runs the functions in Mumbai (`bom1`), next to the
   Supabase project (`ap-south-1`) - every page makes several database round
   trips, so keep the two in the same region if either moves. It also
   schedules `/api/cron/ensure-periods` to run daily - Vercel automatically sends `Authorization: Bearer $CRON_SECRET`
   for cron invocations, so no extra setup is needed.
5. **Smoke test**: sign in with the password; record a payment (it shows
   "not delivered" without Twilio) and download its receipt PDF; check that
   the email link still works; run the cron once from the Vercel dashboard.
6. **Later, Twilio**: add the five `TWILIO_*` variables and redeploy.

## Notes

- **Houses and tenants**: a tenant is onboarded onto one or more vacant houses
  (across towers if needed) with one combined monthly rent, billed per
  tenant. Editing a tenant can swap houses from a date or change the rent
  from a month; earlier months keep the old rent. "Move out" ends their
  houses, which can be re-let from the next day; their dues stay on their
  ledger. Each house keeps its full occupancy history.

- **Currency**: edit `CURRENCY_SYMBOL` in `src/lib/money.ts`.
- **Time zone**: "today" and month boundaries follow `APP_TIME_ZONE`
  (Asia/Kolkata) in `src/lib/dates.ts`.
- **Owner name on receipts**: taken from the owner's Supabase Auth profile
  (`full_name` in user metadata - set it under Authentication → Users), else
  their email.
- **Rate limits**: OTP sends (5/hour per record, 20/hour per IP), confirm
  attempts and sign-in emails are capped in Postgres (`rate_limits`, pruned by
  the daily cron).
- **Link lifetime**: confirmation links expire after 14 days
  (`CONFIRM_LINK_TTL_DAYS` in `src/server/token.ts`); the owner can resend a
  fresh link from the tenant's page.
- **Corrections**: a confirmed payment is never edited - use "Adjust" on the
  tenant's page to record a correction, which goes through the same
  signature + OTP flow with the tenant before it changes anything.
- Cost at this scale should be close to Supabase's and Vercel's free tiers,
  plus a few dollars a month in Twilio per-message charges.
