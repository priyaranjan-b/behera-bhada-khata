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
2. **Run the schema**: Project → SQL Editor → paste the contents of
   `supabase/migrations/0001_init.sql` → Run. (Or `supabase db push` if you
   use the Supabase CLI.)
3. **Create a storage bucket**: Storage → New bucket → name it
   `rent-register` → leave it **private** (not public). The app only ever
   reads/writes it via the server-side secret key and mints short-lived
   signed URLs for viewing receipts.
4. **Get your API keys**: Project Settings → API.
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable (or "anon") key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Secret (or "service_role") key → `SUPABASE_SECRET_KEY` (never expose
     this to the browser)
5. **Enable email magic links**: Authentication → Providers → Email should
   already be on by default. Authentication → URL Configuration → add your
   app URL (and `http://localhost:3000` for local dev) to the redirect
   allow-list, since the login flow redirects to `/auth/callback`.

## 2. Twilio setup

1. Create an account at [twilio.com](https://twilio.com) and grab your
   **Account SID** and **Auth Token** from the console → `TWILIO_ACCOUNT_SID`
   / `TWILIO_AUTH_TOKEN`.
2. **Verify service (for OTP)**: Console → Verify → Services → create one →
   copy its SID → `TWILIO_VERIFY_SERVICE_SID`.
3. **SMS sender**: buy/use a Twilio phone number capable of sending SMS →
   `TWILIO_SMS_FROM` (E.164 format, e.g. `+14155551234`).
4. **WhatsApp sender**: for testing, join the [Twilio WhatsApp
   sandbox](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn)
   and use its sandbox number (`whatsapp:+14155238886` by default) as
   `TWILIO_WHATSAPP_FROM` - each tenant needs to send the sandbox join code
   once. For production, apply for a WhatsApp Business Platform sender
   through Twilio (takes Meta approval) and use that number instead.

## 3. Configure and run

```bash
cp .env.local.example .env.local
# fill in the values from steps 1-2, plus:
#   NEXT_PUBLIC_APP_URL   - http://localhost:3000 for now
#   CRON_SECRET           - any random string, used to protect the cron endpoint

npm install
npm run dev
```

Open `http://localhost:3000`, sign in with your email (you'll get a magic
link), then add a property, a tenant, and record a payment.

## 4. Deploying

1. Push this repo to GitHub and import it into [Vercel](https://vercel.com).
2. Add the same environment variables from `.env.local` in the Vercel
   project's Settings → Environment Variables, setting
   `NEXT_PUBLIC_APP_URL` to your production URL.
3. `vercel.json` already schedules `/api/cron/ensure-periods` to run daily -
   Vercel automatically sends `Authorization: Bearer $CRON_SECRET` for cron
   invocations, so no extra setup is needed once `CRON_SECRET` is set.
4. Add the production URL to Supabase's Authentication → URL Configuration
   redirect allow-list (same as the localhost step above).

## Notes

- **Currency**: edit `CURRENCY_SYMBOL` in `src/lib/money.ts`.
- **Link lifetime**: confirmation links expire after 14 days
  (`CONFIRM_LINK_TTL_DAYS` in `src/lib/token.ts`); the owner can resend a
  fresh link from the tenant's page.
- **Corrections**: a confirmed payment is never edited - use "Adjust" on the
  tenant's page to record a correction, which goes through the same
  signature + OTP flow with the tenant before it changes anything.
- Cost at this scale should be close to Supabase's and Vercel's free tiers,
  plus a few dollars a month in Twilio per-message charges.
