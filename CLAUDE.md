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
  `src/server/services/periods.ts` so arrears show up even for months no one
  logged a payment for).
- `payments` and `adjustments` are **append-only ledger events**, each with
  its own `*_allocations` table mapping the event onto one or more
  `rent_periods`. A mistake is never edited on the original `payments` row —
  it's corrected with a new `adjustments` row referencing it
  (`original_payment_id`), going through the same sign+OTP flow.
- Both ledger tables have a `status`: `pending` → `confirmed`. Only
  `confirmed` rows move `rent_periods.amount_allocated` (see
  `confirmRecord` in `src/server/services/confirm.ts`; the adapter's
  `confirm()` is an `.eq("status", "pending")` compare-and-swap, so
  confirmation is idempotent under a race).
- RLS enforces this at the DB level too: `authenticated` (the owner) can
  `INSERT`/`SELECT` on ledger tables but has `UPDATE`/`DELETE` revoked
  outright, with a narrow re-grant of just `token_hash`/`token_expires_at`
  (for resending an expired link). The pending→confirmed transition is only
  ever performed by server code using the service-role admin client, which
  bypasses RLS.

### Data access — layers (the UI never touches the database)

```
UI         src/app/** pages, src/components/**
             Server Components: serverApi  (src/lib/api-client/server.ts)
             Client Components: api        (src/lib/api-client/index.ts, fetch)
API        src/app/api/**/route.ts — thin: auth + JSON via src/server/http.ts,
             then one service call. The tree mirrors the pages:
             app/dashboard/tenants/[tenantId]/page.tsx
               ↔ app/api/dashboard/tenants/[tenantId]/route.ts
             Writes POST to the collection (…/tenants/[id]/payments); a form
             page's data is a GET at its own path (…/payments/new).
Services   src/server/services/* — business logic, no Next.js/Supabase imports
Ports      src/server/ports.ts — OwnerRepositories, SystemRepositories,
             AuthGateway, FileStorage interfaces
Infra      src/server/infra/index.ts — binds ports to an adapter
Adapters   src/server/adapters/supabase/* — the ONLY code importing @supabase
```

- Shapes crossing the API are in `src/lib/contracts.ts`; the client surface
  is typed by `ApiQueries`/`ApiCommands` (`src/lib/api-client/types.ts`) and
  every path is in `src/lib/api-client/paths.ts`. Adding an endpoint = service
  function + `route.ts` + path + a line in `http.ts` (and in `server.ts` if
  pages read it).
- Server Components call services **in-process** through `serverApi` (Next
  docs: don't fetch your own route handlers from Server Components). It maps
  401 → `/login` and 404 → `notFound()`, so pages don't check either. Setting
  `API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` sends all calls over HTTP to a
  standalone backend instead — that's the migration path to a separate
  Node.js server (move `src/server/**` there behind the same routes).
- Swapping the database (e.g. MySQL) = a new adapter implementing
  `src/server/ports.ts`, bound in `src/server/infra/index.ts`.
  `ownerDb(ownerId)` must scope every query to that owner (the Supabase
  adapter uses the RLS session client *and* explicit `owner_id` filters);
  `systemDb()` is unscoped (service role) and only for flows that authorize
  some other way: the confirm token, rent-period upkeep, cron.
- Services throw `ApiError(status, message)` (`src/lib/errors.ts`); the route
  helpers turn it into `{ error }` JSON and the API client rethrows it.
- ESLint enforces the layering (`no-restricted-imports` in
  `eslint.config.mjs`).
- Step-by-step recipes: the `add-api-endpoint` and `build-dashboard-page`
  skills in `.claude/skills/`.

### Auth & routing

- Route protection is a `src/proxy.ts` file, not `middleware.ts` — **Next.js
  16 renamed Middleware to Proxy** (same mechanics, see
  `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). It
  redirects unauthenticated requests to `/dashboard/**` to `/login`.
  `src/app/dashboard/layout.tsx` does the same check again server-side
  (`serverApi.auth.session()`) as the authoritative guard. The proxy also
  refreshes the session cookie (`src/server/adapters/supabase/proxy.ts`).
- Login is Supabase email magic link. It lands on the `/auth/callback` page,
  which forwards `?code=` to `GET /api/auth/callback` (only a route handler
  can set cookies) or posts `#access_token` to `POST /api/auth/session`. The
  tenant-facing
  `/confirm/[token]` flow has no login at all — auth is the token itself.

### The confirm flow

`/confirm/[token]` (tenant-facing, unauthenticated) is served by
`src/server/services/confirm.ts`: the token is hashed (`src/server/token.ts`)
and looked up via `systemDb()`; the tenant requests an OTP
(`src/server/messaging/twilio.ts`) and posts it with their signature to
`POST /api/confirm/[token]`, which verifies the OTP, stores the signature in
private storage, renders the PDF (`src/server/pdf/receipt.ts`), then flips the
record to confirmed and applies its allocations. Resending a link
(`.../resend` routes) only rotates the token columns, never ledger facts.

### Money & dates

- All money is `numeric(12,2)` columns, handled as plain JS numbers rounded
  through `round2()` in `src/lib/money.ts`; display via `formatMoney()`
  (`CURRENCY_SYMBOL` is the one thing to edit for a different currency).
- `src/lib/allocation.ts` (oldest-first payment allocation, balance
  summaries) is deliberately pure with no `server-only` import — it's shared
  between server code and the client-side `PaymentForm` so the UI can
  recompute the same suggestion as the owner types an amount.
- Month keys are `yyyy-MM-dd` strings (first of month);
  `src/server/services/periods.ts` / `src/lib/reports.ts` build reporting
  views on top of `rent_periods`.

### Conventions

- Server-only modules start with `import "server-only"`; if a `src/lib/*`
  file lacks that import, assume it's meant to run on the client too.
- API routes are one line per method: `ownerRoute` / `publicRoute` /
  `ownerLinkRoute` from `src/server/http.ts` around a service call. Services
  validate their own input with `zod` schemas from `src/lib/validation.ts`
  (`parseInput`), so validation holds whichever transport calls them.

### UI & styling

- Theme: `src/theme/` is the MUI Dashboard template (MIT, copied from
  mui/material-ui v9.5.0 — keep those files close to upstream) plus app
  additions in `src/theme/customizations/app.ts` (Chip `warning`/`info`/`tag`,
  Avatar `soft`, touch targets, global tabular numbers) and
  `src/theme/appTokens.ts` (slate ramp; light-mode depth layers: slate
  `background.default` canvas, white `background.paper` for cards/header/side
  menu, `#E2E8F0` dividers, `#F8FAFC` grid-row hover). Light + dark schemes
  via CSS variables, so never read `theme.palette.*` in JS for colours — use
  `sx` palette keys or `theme.vars`.
- Shared UI kit: `src/components/ui/` (`SectionCard`, `FormActions`,
  `SignatureField`, `SummaryLine`, `DetailRow`, `PublicLayout`, …) and
  `src/components/DataComponents.tsx` (`PageHeader`, `DashboardCardPanel`,
  `StatusBadge`, …). Tables use `src/components/AppDataGrid.tsx`.
- Pages (`src/app/**`) set **layout only** (Stack/Grid props, `alignItems`,
  `minWidth: 0`, `maxWidth`). No colour, typography, border, radius or shadow
  `sx`, no `@/theme` imports. Text colour via the Typography/Link prop
  `color="textSecondary"` — MUI v9 dropped the dotted `"text.secondary"` form
  for that prop and silently renders it as the default colour (dotted paths
  still work inside `sx`). If a
  page needs something visual twice, add it to the kit or the theme instead.
