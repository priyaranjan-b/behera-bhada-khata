# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project overview

Behera Bhada Khata (ବେହେରା ଭଡ଼ା ଖାତା) — a digital version of a landlord's rent
book. An owner records a rent payment, the tenant gets a link over
WhatsApp/SMS, draws a signature and verifies an SMS OTP, and a signed PDF
receipt is generated for both sides. Payments and corrections are
append-only — see `supabase/migrations/0001_init.sql`.

Stack: Next.js 16 (App Router) on Vercel, Postgres/Auth/Storage on Supabase,
Twilio for SMS OTP + WhatsApp/SMS delivery, MUI for UI, `pdf-lib` for
receipts, `zod` for validation.

## Commands

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build
npm run start    # run a production build
npm run lint     # eslint (flat config, eslint-config-next)
```

There is no test suite in this repo currently.

Local setup requires a Supabase project (schema + storage bucket) and Twilio
credentials — see `README.md` and `.env.local.example` for the full list of
env vars and setup steps.

## Architecture

### Ledger design (the core domain model)

The schema (`supabase/migrations/0001_init.sql`, `0002_units_and_search.sql`)
and the types in `src/lib/types.ts` are the source of truth for the data
model — `types.ts` is hand-maintained to match the SQL and says so at the top
of the file; update both together (or regenerate with
`npx supabase gen types typescript`).

- `properties` → `tenants` → `rent_periods` (one row per tenant per calendar
  month owed, created ahead of time by `ensureRentPeriods` in
  `src/lib/periods.ts` so arrears show up even for months no one logged a
  payment for).
- `payments` and `adjustments` are **append-only ledger events**, each with
  its own `*_allocations` table mapping the event onto one or more
  `rent_periods`. A mistake is never edited on the original `payments` row —
  it's corrected with a new `adjustments` row referencing it
  (`original_payment_id`), going through the same sign+OTP flow.
- Both ledger tables have a `status`: `pending` → `confirmed`. Only
  `confirmed` rows move `rent_periods.amount_allocated` (see
  `confirmRecordAndApplyAllocations` in `src/lib/ledger.ts`, which uses an
  `.eq("status", "pending")` compare-and-swap to make confirmation
  idempotent under a race).
- RLS enforces this at the DB level too: `authenticated` (the owner) can
  `INSERT`/`SELECT` on ledger tables but has `UPDATE`/`DELETE` revoked
  outright, with a narrow re-grant of just `token_hash`/`token_expires_at`
  (for resending an expired link). The pending→confirmed transition is only
  ever performed by server code using the service-role admin client, which
  bypasses RLS.

### Three Supabase clients — pick the right one

- `src/lib/supabase/client.ts` — browser client (anon key), RLS-scoped.
- `src/lib/supabase/server.ts` — server client (cookie-based session), also
  RLS-scoped to the logged-in owner. Used from Server Components, layouts,
  and API routes that act "as" the owner (via `requireAuthedClient()` in
  `src/lib/api.ts`).
- `src/lib/supabase/admin.ts` — service-role client, **bypasses RLS**. Only
  import from server-only code that itself enforces authorization —
  primarily the tenant-facing confirm-token flow (`src/lib/ledger.ts`,
  `src/app/api/confirm/**`), where possession of the unguessable token is
  the auth check instead of a Supabase Auth session.

### Auth & routing

- Route protection is a `src/proxy.ts` file, not `middleware.ts` — **Next.js
  16 renamed Middleware to Proxy** (same mechanics, see
  `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). It
  redirects unauthenticated requests to `/dashboard/**` to `/login`.
  `src/app/dashboard/layout.tsx` does the same check again server-side
  (`supabase.auth.getClaims()`) as the authoritative guard.
- Login is Supabase email magic link (`/auth/callback`); the tenant-facing
  `/confirm/[token]` flow has no login at all — auth is the token itself.

### The confirm flow

`/confirm/[token]` (tenant-facing, unauthenticated) ties most of `src/lib/`
together: `loadPendingRecordByToken` (`ledger.ts`) resolves the token
(`token.ts` hashes it, `hashToken`/`generateConfirmToken`), the tenant draws
a signature and requests an OTP (`messaging/twilio.ts`), submits it plus the
signature to `POST /api/confirm/[token]`, which verifies the OTP, uploads
signatures to private Supabase Storage (`storage.ts`), renders a PDF
(`pdf/receipt.ts`), then atomically confirms the record and applies its
allocations (`confirmRecordAndApplyAllocations`). `resend.ts` rotates the
token to reissue an expired/lost link without touching ledger facts.

### Money & dates

- All money is `numeric(12,2)` columns, handled as plain JS numbers rounded
  through `round2()` in `src/lib/money.ts`; display via `formatMoney()`
  (`CURRENCY_SYMBOL` is the one thing to edit for a different currency).
- `src/lib/allocation.ts` (oldest-first payment allocation, balance
  summaries) is deliberately pure with no `server-only` import — it's shared
  between server code and the client-side `PaymentForm` so the UI can
  recompute the same suggestion as the owner types an amount.
- Month keys are `yyyy-MM-dd` strings (first of month); `periods.ts` /
  `reports.ts` build reporting views on top of `rent_periods`.

### Conventions

- Server-only modules start with `import "server-only"`; if a `src/lib/*`
  file lacks that import, assume it's meant to run on the client too.
- API routes follow one pattern: parse/validate with a `zod` schema from
  `src/lib/validation.ts`, get an authed client via `requireAuthedClient()`,
  return `NextResponse.json({ error }, { status })` on failure.
