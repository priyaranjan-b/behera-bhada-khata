# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project overview

Behera Bhada Khata (ବେହେରା ଭଡ଼ା ଖାତା) — a digital version of a landlord's rent
book. An owner records a rent payment, which counts immediately and has a
downloadable PDF receipt. Optionally the tenant gets a link over
WhatsApp/SMS, draws a signature and verifies an SMS OTP to acknowledge it,
which produces a tenant-signed receipt. Payments and corrections are
append-only — see `supabase/migrations/0001_init.sql`.

Stack: Next.js 16 (App Router) on Vercel, Postgres/Auth/Storage on Supabase,
Twilio for SMS OTP + WhatsApp/SMS delivery, MUI for UI, `pdf-lib` for
receipts, `zod` for validation.

## Commands

```bash
npm run dev       # start dev server (http://localhost:3000)
npm run build     # production build
npm run start     # run a production build
npm run lint      # eslint (flat config, eslint-config-next)
npm run typecheck # tsc --noEmit
npm test          # vitest: unit, service (fake ports) and migration tests
npx vitest run test/schema.test.ts   # one file
```

Tests: pure modules have a colocated `*.test.ts`; service tests live in
`test/services/` and swap the ports for in-memory fakes (`test/fakes.ts`,
`vi.mock("@/server/infra", …)`); `test/schema.test.ts` applies every
migration to an in-process Postgres (PGlite) with stubs for Supabase's
`auth`/`storage` schemas and roles, then exercises the ledger functions under
RLS. Any migration change needs a case there. CI (`.github/workflows/ci.yml`)
runs lint, typecheck, test and build.

Local setup requires a Supabase project (run `supabase/migrations/*` in
order) — see `README.md` and `.env.local.example`. Twilio is optional
everywhere (tenant messages then show as "not delivered" and OTP sends fail;
a production server logs a warning). `CRON_SECRET` is optional in
development, required in production.

## Architecture

### Design decisions

- **Database:** `docs/database-design.md` (D1–D25), see below.
- **Everything else:** `docs/design-decisions.md` (A1…): Vercel `bom1`
  region and hand-migrated production DB (no `db push`), Twilio optional in
  production (`tenantMessaging`), owner password login, MyRentHQ branding,
  real names stay local, `statusLabel`, the custom Excel export
  (`exportValue`, MUI's is Premium-only), the per-tower monthly-rent split,
  the audit history screens and events (A10), and Govt rent counted as paid
  direct (A11). Read it before changing
  any of these, and add a new A-number when you make a decision a future
  session should know.

### Ledger design (the core domain model)

**Read `docs/database-design.md` before changing anything in the database.**
It records every schema decision and why, with checklists for adding tables
and functions. The schema (`supabase/migrations/*.sql`) and the types in
`src/lib/types.ts` are the source of truth for the data model. `types.ts` is
hand-maintained to match the SQL and says so at the top of the file; update
both together.

- **Single owner.** The rent book has exactly one owner, recorded once in
  `app_owner` (`0003_single_owner.sql`). No table has an `owner_id` column.
  Every RLS policy and owner-facing SQL function checks `is_app_owner()`,
  and with no owner row nothing is readable (it fails closed). The app turns
  a signed-in non-owner into a 403 / `/login?error=owner`
  (`getOwnerContext()` in `src/server/services/auth.ts`).

- **Places** (`0006_property_master_data.sql`): `locations` (site, `AC`) →
  `properties` (tower, `AC-T1`) → `units` (house, `AC-T1-G01`). The codes
  are the primary keys and child tables reference them directly. They are
  **permanent**: a trigger rejects any code change, so rename via `name` and
  retire a house with `is_active = false`, never delete. `tower_code` and
  `house_number` are generated from the code. Master data from the paper
  register is in `supabase/seed/arnapal_master_data.sql` (2 sites, 7 towers,
  40 houses), which also claims ownership for the email you put in it. Houses
  are pure master data: who occupies them is a tenant, never a column on
  `units`.
- **Draft tenants** (`0007_draft_tenants.sql`): `tenants.status` is `draft |
  active | inactive`. The register's 26 occupants
  (`supabase/seed/arnapal_tenants.sql`, gitignored: real names stay local)
  are drafts. A draft holds its houses
  but has no phone, rent or lease start yet and is never billed. Saving all
  three through Edit tenant (`update_tenant`) makes it active. The UI hides
  "Record payment" for drafts and lists them under "Drafts - details
  missing".
- **Billing start ≠ lease start** (`0008_billing_start.sql`): rent months
  start at `tenants.billing_start`, which is the month after the "rent paid up
  to" entered when onboarding or completing a draft (never before the lease
  month). `lease_start` is history only, so an old lease start doesn't
  create years of fake arrears.
- **Correcting "paid up to"** (`0014_correct_paid_through.sql`, D24): the
  "Correct" button by "Billing from" on an active tenant's page calls
  `correct_paid_through`, which moves `billing_start` and adds or drops
  months (refused if a dropped month has a payment).
- **Government tenants** (`0016_government_tenants.sql`, D26):
  `tenants.tenant_kind` is `individual | business | government`. A
  government tenant may have no phone, and with `rent_tracked = false`
  (rent paid to the owner's bank directly) it is active and holds its
  houses, but has no `billing_start`, no rent months and no Record payment.
  "Start tracking rent" (`start_rent_tracking`) bills it from the month
  after "paid up to"; `stop_rent_tracking` undoes that until a payment
  exists. "Billed" in JS is `isRentTracked` / `billedTenantIds`. Their
  agreement rent still counts as billed and collected every month
  (`paidDirectPeriods`, computed and never stored; A11).
- **Security deposit** (`tenants.deposit_amount`, optional): set when
  onboarding or while a draft, then frozen by a trigger once the tenant is
  active (D18).
- **People and money keep uuids.** `tenants` → `rent_periods` (one row per
  tenant per calendar month owed, created ahead of time by the
  `ensure_rent_periods` SQL function — `ensureRentPeriodsFor` in
  `src/server/services/periods.ts`, plus the daily cron — so arrears show up
  even for months no one logged a payment for). **Billing is per tenant:**
  one combined monthly rent covers all of a tenant's houses.
- **Outstanding counts only months that have ended** (up to the end of last
  month): `summarizeBalance` in `src/lib/domain/allocation.ts`, used by every
  screen. Rent rows for the current month and later exist (created ahead so
  rent can be paid in advance) but are "not due yet" (`notYetDue`), shown as
  such in the Months table and ledger and left out of balances.
- **Which houses, at what rent, and when are dated history, never
  overwritten.**
  - `tenant_units` (start/end dates; `end_date` inclusive, null = current) is
    protected by a `btree_gist` exclusion constraint: no two tenancies of a
    house overlap. Back-to-back tenancies are fine, which is how a house is
    re-let.
  - `tenant_rent_rates` (`effective_month`, `monthly_amount`) prices each
    month: `rent_for_month()`.
  - Both change only through the `SECURITY DEFINER` functions
    `create_tenant`, `update_tenant` (diffs the house set as of a date;
    changes rent from a month, re-pricing only months with no payment
    against them) and `move_out_tenant` (ends the houses, stops billing after
    the move-out month, keeps the dues). The owner role has
    `INSERT`/`UPDATE`/`DELETE` revoked on `tenants`, `tenant_units` and
    `tenant_rent_rates`.
  - "Who lived where, when" is the `unit_occupancy` view;
    `src/server/services/placements.ts` derives a tenant's current houses and
    rent from it.
- `payments` and `adjustments` are **append-only ledger events**, each with
  its own `*_allocations` table mapping the event onto one or more
  `rent_periods`. A mistake is never edited on the original `payments` row —
  it's corrected with a new `adjustments` row referencing it
  (`original_payment_id`), which also counts at once.
- **Payment proofs** (`0009_payment_proofs.sql`, D19): photos/PDFs attached
  when recording a payment, one `payment_proofs` row each, written by
  `create_payment` (`p_proofs`) in the same transaction and stored under
  `payments/<tenant>/<payment>/proofs/`. The form compresses photos in the
  browser (`src/lib/proofImages.ts`) and sends multipart
  (`readJsonWithFiles` in `src/server/http.ts`); the service checks the
  bytes and the limits in `PROOF_LIMITS` (`src/lib/validation.ts`).
- **Receipt numbers** (`0012_receipt_numbers.sql`, D22): `payments.receipt_no`
  `2026/10/001` (month recorded, Asia/Kolkata; one series across tenants,
  restarting each month), adjustments `ADJ/2026/10/001`. Taken by
  `create_payment` / `create_adjustment` in the same transaction (no gaps),
  frozen by a trigger; shown on the receipt, the ledger and the confirm page.
- **Owner profile** (`0013_owner_profile.sql`, D23): the owner's first/last
  name (landlord on receipts, name in the app shell), `signature_name` for
  whoever signs on their behalf, and a saved signature (`owner/...png`) that
  the payment and adjustment forms use unless you sign by hand - each record
  gets its own copy. Edited on `/dashboard/profile`
  (`src/server/services/profile.ts`).
- **Tenant documents** (`0011_tenant_documents.sql`, D21): ID proof, photo,
  agreement... uploaded from the Edit tenant page (`TenantDocumentsCard`,
  `src/server/services/tenantDocuments.ts`), one `tenant_documents` row per
  file with a free-text `document_type`. Unlike the ledger, the owner may
  delete them.
- **Audit log** (`0015_audit_log.sql`, D25): triggers on every vital table
  append `{column: [old, new]}` diffs to `audit_log` (grouped by `tx_id`);
  `log_event()` adds app events (messages, receipt downloads, sign-ins).
  Nobody, not even the service role, can edit or delete it. Reads and the
  best-effort `recordEvent` are in `src/server/services/audit.ts`, the text
  in `src/lib/domain/audit.ts`; shown by `AuditTimeline` and
  `/dashboard/activity` (A10). A new table with vital data gets the
  trigger (checklist in `docs/database-design.md`).
- **Recorded = counted** (`0010_instant_confirmation.sql`, D20): both
  ledger tables are written as `status = 'confirmed'` and applied to
  `rent_periods.amount_allocated` in the same transaction. The tenant's
  signature + OTP is an optional acknowledgement (`acknowledged_at`) that
  never moves money. `pending` survives only in the type, for old rows.
- **Every money-moving write is one Postgres function**
  (`supabase/migrations/0004_ledger_integrity.sql`), never a sequence of
  client calls: `create_payment` / `create_adjustment` (`SECURITY DEFINER`,
  owner check first) lock the months, check the invariants (allocations sum
  to the amount, belong to that tenant / the original payment's months, stay
  within `[0, amount_due]`), insert the record and its allocations and do
  `amount_allocated = amount_allocated + delta`, all in one transaction;
  `acknowledge_payment` / `acknowledge_adjustment` record the tenant's
  signature (compare-and-swap on `acknowledged_at`). Never compute a balance
  in JS and write it back.
- Errors meant for the user are raised with SQLSTATE `BBK00` (→ 400),
  `BBK04` (→ 404) or `BBK09` (→ 409); `mustWrite`/`writeError` in
  `src/server/adapters/supabase/clients.ts` map those and log-and-hide every
  other database error.
- RLS enforces this at the DB level too: `authenticated` (the owner) can
  only `SELECT` ledger tables (`INSERT` revoked in 0010, so writes go through
  `create_*`; `UPDATE`/`DELETE` revoked outright), with a narrow re-grant of
  just `token_hash`/`token_expires_at` (for sending a link until the tenant
  acknowledges). The acknowledge functions,
  `ensure_rent_periods` and the rate-limit functions are executable by
  `service_role` only; `create_*` and the tenant lifecycle functions by
  `authenticated` (each starts with `if not is_app_owner()`). Supabase grants
  EXECUTE on new functions to everyone by default, so every new function's
  migration must revoke and re-grant explicitly.

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
Services   src/server/services/* — business logic, no Next.js/Supabase/Twilio imports
Ports      src/server/ports.ts — OwnerRepositories, SystemRepositories,
             AuthGateway, FileStorage, Messaging interfaces
Infra      src/server/infra/index.ts — binds ports to adapters
Adapters   src/server/adapters/supabase/* — the ONLY code importing @supabase
           src/server/adapters/twilio/*   — the ONLY code importing twilio
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
  `src/server/ports.ts`, bound in `src/server/infra/index.ts`. `ownerDb()`
  must refuse anyone but the single app owner; the Supabase adapter relies on
  RLS (`is_app_owner()`) via the session client, so another database must
  enforce the same check itself. Services take an `OwnerContext` (from
  `getOwnerContext()`) as proof the check ran; name it `_ctx` where unused.
  Tower routes take the property code (`/dashboard/properties/AC-T1`);
  services parse it with `propertyCodeSchema`, and a malformed code is a
  404.
  `systemDb()` is unscoped (service role) and only for flows that authorize
  some other way: the confirm token, rent-period upkeep, rate limits, cron.
- Services throw `ApiError(status, message)` (`src/lib/errors.ts`); the route
  helpers turn it into `{ error }` JSON and the API client rethrows it.
- ESLint enforces the layering (`no-restricted-imports` in
  `eslint.config.mjs`).
- Step-by-step recipes: the `add-api-endpoint` (anything touching the API
  or database; it starts from `docs/database-design.md`) and
  `build-dashboard-page` skills in `.claude/skills/`.

### Auth & routing

- Route protection is a `src/proxy.ts` file, not `middleware.ts` — **Next.js
  16 renamed Middleware to Proxy** (same mechanics, see
  `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). It
  redirects unauthenticated requests to `/dashboard/**` to `/login`, and
  refreshes the session cookie (`src/server/adapters/supabase/proxy.ts`).
- **Authorization happens in the data call, not the layout.**
  `src/app/dashboard/layout.tsx` checks the session for the shell, but
  layouts don't re-render on client navigation, so it is not a guard. What
  protects data is that every owner read/write goes through `serverApi` (its
  `owner()` → `getOwnerContext()`) or `ownerRoute`, which return 401 without
  a session and 403 for a signed-in account that isn't the owner, backed by
  RLS in the database. Never add a page or route that reads owner data any
  other way.
- Login is Supabase Auth, two ways on the `/login` tabs. **Password**:
  `POST /api/auth/password` (`signInWithPassword` in
  `src/server/services/auth.ts`) signs in, then signs a non-owner straight
  back out; the owner sets the password on `/dashboard/profile`
  (`changePassword`, `PASSWORD_LIMITS`). **Email magic link**: it lands on the `/auth/callback` page,
  which forwards `?code=` to `GET /api/auth/callback` (only a route handler
  can set cookies) or posts `#access_token` to `POST /api/auth/session`. The
  tenant-facing `/confirm/[token]` flow has no login at all — auth is the
  token itself.
- Who may sign in: `OWNER_EMAILS` (listed emails may also sign up); unset =
  existing accounts only. `ALLOW_DEV_LOGIN=1` returns the magic link to the
  browser instead of emailing it, and is ignored in production.

### The confirm (acknowledge) flow

Optional since 0010: the payment already counts. `/confirm/[token]`
(tenant-facing, unauthenticated) is served by
`src/server/services/confirm.ts`: the token is hashed (`src/server/token.ts`)
and looked up via `systemDb()`; the tenant requests an OTP (the `Messaging`
port, `src/server/adapters/twilio/messaging.ts`) and posts it with their
signature to `POST /api/confirm/[token]`, which verifies the OTP, renders the
PDF (`src/server/pdf/receipt.ts`) **before writing anything**, uploads the
signature and PDF under a fresh per-attempt folder, then calls
`acknowledge_payment`/`acknowledge_adjustment`; if that doesn't win, the
files are deleted. Any failure leaves it unacknowledged and retryable.
Receipt data for both sides comes from `src/server/services/receipts.ts`;
the owner's download (`.../payments/[id]/receipt`) renders it on demand
until the tenant-signed copy exists.

- The receipt (`src/server/pdf/receipt.ts`) is always two pages at most.
  Page 1 is a card layout (brand, receipt number, tenant, details, charges,
  total + amount in words via `amountInWords` in `src/lib/money.ts`, owner
  and tenant signatures) and never overflows: long values are capped and
  ellipsised, and more than `MAX_LINE_ROWS` months collapse into ranges
  (`compactLineItems`). Page 2, if there are proofs, shows up to 6 as a grid
  (`src/server/pdf/proofPages.ts`: images go through `sharp` to JPEG, since
  pdf-lib can't embed WebP; a PDF proof shows its pages; HEIC or unreadable
  files get a note).
- The receipt embeds Noto Sans + Noto Sans Oriya (`src/server/pdf/fonts/`,
  OFL) because the standard PDF fonts can't encode `₹` or Odia; they're
  traced into the route via `outputFileTracingIncludes` in `next.config.ts`
  — a new route that renders PDFs must be added there.
- Public endpoints that cost money or send email (OTP send, confirm, magic
  link) call `enforceRateLimits` (`src/server/services/context.ts`, backed by
  the `rate_limits` table); their routes pass `requestMeta(request)` for the
  client IP.
- Resending a link (`.../resend` routes) takes no body: the tenant and amount
  come from the record itself, and only the token columns rotate.
- Services report whether the tenant was actually messaged (`notified`); the
  UI shows a warning flash when not.

### Money & dates

- All money is `numeric(12,2)` columns, handled as plain JS numbers rounded
  through `round2()` in `src/lib/money.ts`; display via `formatMoney()`
  (`CURRENCY_SYMBOL` is the one thing to edit for a different currency).
- `src/lib/domain/` (`allocation.ts` oldest-first allocation and balances,
  `reports.ts`, `tenantLedger.ts`, `tenant.ts`) is pure and framework-free
  with no `server-only` import — shared between services and client
  components such as `PaymentForm` — and unit-tested next to the code.
- **Dates go through `src/lib/dates.ts`**: "today", "this month" and the day
  a timestamp falls on are in `APP_TIME_ZONE` (Asia/Kolkata), never UTC or
  the runtime's zone. Date keys are `yyyy-MM-dd`, month keys the first of the
  month (`yyyy-MM-01`, matching `rent_periods.period_month`); use
  `todayKey` / `currentMonthKey` / `addMonthsToKey` / `dateKeyOf`, and
  `formatMonth` (fixed locale, so server and browser render the same text).
  Don't use `toISOString().slice(0, 10)` or bare `toLocaleDateString`.

### Conventions

- Server-only modules start with `import "server-only"`; if a `src/lib/*`
  file lacks that import, assume it's meant to run on the client too.
- Configuration: server code reads `env()` from `src/server/env.ts` (zod
  schema, validated at startup by `src/instrumentation.ts`, never during
  `next build`); browser code reads `src/lib/publicEnv.ts`. ESLint bans
  `process.env` anywhere else. A new variable goes in the schema and in
  `.env.local.example`.
- API routes are one line per method: `ownerRoute` / `publicRoute` /
  `ownerLinkRoute` / `cronRoute` from `src/server/http.ts` around a service
  call. Services validate their own input with `zod` schemas from
  `src/lib/validation.ts` (`parseInput`), so validation holds whichever
  transport calls them.

### Single source of truth (rules from the Oct 2026 code review)

Each of these was found broken somewhere; keep them when adding code.

- **Redirect targets are untrusted.** Any `next`/return URL from a query
  param goes through `safeNext` (`src/lib/redirects.ts`) before
  `redirect`, `router.push` or `window.location.assign`, on the server and
  the client alike.
- **Enums are declared once.** Payment modes, tenant/ledger statuses, record
  types, unit types and channels are one `as const` array (or union) in
  `src/lib/types.ts` (`PAYMENT_MODES`, `UNIT_TYPES`, `PREFERRED_CHANNELS`,
  `TENANT_STATUSES`, `RECORD_TYPES`); zod enums (`z.enum(PAYMENT_MODES)`),
  `<MenuItem>` lists and labels derive from it. Never show a raw enum value
  (`bank_transfer`) to a user: use the label maps in `src/lib/domain/`
  (`paymentModeLabel`, `PAYMENT_MODE_OPTIONS` in `payments.ts`;
  `TENANT_STATUS_DISPLAY`, `UNIT_TYPE_LABELS`, `PREFERRED_CHANNEL_OPTIONS`
  in `tenant.ts`), client-safe so the PDF and the UI share them. A tenant's
  status badge is `TenantStatusBadge`. Comparing against the typed union
  (`status === "active"`) is fine; TypeScript checks it.
- **A limit lives in one exported constant** in `src/lib/validation.ts`
  (like `PROOF_LIMITS`). The zod schema, the service check and the form
  (`maxLength`, `accept`, "6-digit code", "at most N files") all read it.
  Payment proofs and tenant documents are different things: don't reuse one
  limit for the other.
- **Domain rules exist once, in `src/lib/domain/`.** A component that needs
  e.g. billing start calls `billingStartFor`, vacancy calls `isVacant`; it
  never re-derives the rule inline. Month input ↔ month key conversions and
  month arithmetic go through `src/lib/dates.ts` (`yearMonthOf` for the
  `yyyy-MM` of an input/URL/grouping key, `monthKeyOf` back,
  `monthsBetween`, `addMonthsToKey`), never `.slice(0, 7)` or
  `` `${month}-01` ``.
- **Every date a user sees is formatted** (`formatDateKey`, `formatMonth`,
  `formatDateTime`); never render a raw `yyyy-MM-dd`. Every number/date
  formatter passes `APP_LOCALE` (no `"en-IN"` literals, no
  `toLocaleString(undefined, …)`, which differs between server and browser).
- **Page URLs and flash params are not ad-hoc strings.** Build page links
  with `routes` from `src/lib/routes.ts` (the page twin of `apiPaths`; a new
  page gets an entry there), e.g. `routes.tenants.detail(id, { saved: "1" })`.
  Flash keys are `FLASH` / `Flash` from the same file, used by the writer
  and by the page's `<FlashAlert param={FLASH.saved}>`. A new page also gets its entry
  in `ROUTE_LABELS` (`AppBreadcrumbs.tsx`), or its crumb trail breaks.
- **Third copy = extract.** When the same block appears in a second file,
  extract it before adding a third: grid columns go in
  `src/components/ui/DataTable/columns.ts`, status → tone/label maps in
  `src/lib/domain/`, repeated form plumbing (submit/error/redirect, file
  queue, confirm dialog) in a hook or kit component. In services: the tenant
  lookup + `notFound`, uuid checks, file upload with rollback and
  payment/adjustment twins share one helper keyed by record kind.
- **No magic numbers in services:** signed-URL lifetimes
  (`SIGNED_URL_SECONDS`) and rate limits (`RATE_LIMITS`) are named constants
  in `src/server/services/context.ts`. Ids from the URL go through
  `requireId(id, "Payment")` / `requireTenant(db, id)` from the same file
  (malformed uuid → 404, never a 500 from Postgres) before any DB lookup.
  Test fixtures therefore use real uuids.
- **Imports:** the Loading kit is imported from `@/components/ui/Loading`
  (the barrel), never a deep path. Export only what another module uses.
- **Tests:** a new service function gets a case in `test/services/`, a new
  pure helper a colocated `*.test.ts`.
- After deleting or moving a route, run `npx next typegen`: stale
  `.next/types/validator.ts` otherwise fails `npm run typecheck`.

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
- Components: `src/components/ui/` = presentational primitives
  (`SectionCard`, `FormActions`, `SignatureField`, `PublicLayout`, …;
  `DataDisplay.tsx` for `PageHeader`, `DashboardCardPanel`, `StatusBadge`,
  `EmptyState`; `Skeletons.tsx` for per-card `loading.tsx` placeholders
  sized like the real cards; `AppCard.tsx` for every card surface;
  `DataTable/` for tables; `Loading/` for busy states; `Link`,
  `FlashAlert`, …), `src/components/shell/` = dashboard chrome,
  `src/components/domain/` = data-aware widgets (`ResendButton`,
  `StatusChip`, `BillingCollectionChart`). One component per file,
  `PascalCase.tsx`. Keep server-safe files free of `"use client"`; put
  interactive pieces (callbacks, state) in their own client file, as with
  `DataTable`.
- Tables: `DataTable` (`src/components/ui/DataTable/`) wraps
  `@mui/x-data-grid` and owns its card. Configure it with props, not a
  wrapping `DashboardCardPanel`: `title`/`subtitle` (one toolbar row with a
  count chip), `filters` ("Show: …" selects that filter `rows` before the
  grid; pass `totalCount` so the chip reads "12 of 26" and `defaultValue` so
  "Clear filters" can reset them), `toolbarExtra` (e.g. date inputs),
  `search`, `columnsButton`/`filterButton`/`exportCsv`/`exportExcel` (on
  by default; columns are `DataTableColDef` with an optional `exportValue`,
  see A8 in `docs/design-decisions.md`), `pageSize`
  (default 10), `emptyState` (when there are no rows at all), `noRowsLabel`,
  `rowDensity` (`standard` 56px for avatar + two-line cells, `dense` 44px)
  and `variant="plain"` inside another card. Money columns via
  `moneyColumn`.
- The top-bar search (`src/components/shell/Search.tsx`, also behind the
  search icon in the mobile `AppNavbar`) loads `GET /api/dashboard/search`
  once per page and matches tenants (name, business) and houses (label,
  code) in the browser with `src/lib/domain/search.ts`.
- Defaulters (`/dashboard/defaulters`, `getDefaultersReport` in
  `src/server/services/dashboard.ts`): every tenant, moved-out ones too,
  with rent unpaid for an ended month, most months behind first. Aging
  (`agingOf`, `compareAging`, `agingGroups`, `AGING_BUCKETS` in
  `src/lib/domain/reports.ts`) splits the arrears by how long ago each month
  ended; the cards group tenants by how many months they're behind.
- Every segment with its own data has `error.tsx` (props `error` + `retry` —
  Next 16 renamed `reset`), `loading.tsx` and, where `notFound()` is likely,
  `not-found.tsx`; the root has `global-error.tsx` (renders its own `<html>`
  and theme).
- One-time messages after a redirect use a query param plus `FlashAlert`,
  which removes the param so reloads and Back don't repeat it.
- **Customising an MUI component = a reusable kit component.** Whenever an
  MUI component needs a look or behaviour beyond its plain props (shadow,
  shape, loading state, extra slots…), wrap it once in `src/components/ui/`
  (or a theme variant in `src/theme/customizations/app.ts` when it's
  purely visual) and use that wrapper everywhere, so every screen stays
  consistent. Never restyle MUI ad hoc in a page or feature component. Check
  the kit first and extend an existing wrapper with a prop rather than
  forking it. The wrappers so far: `AppCard` (Card: raised 3D shadow, `href`
  makes the whole card a link, `depth="flat"` for dashed/inset surfaces),
  `DataTable` (Data Grid), `LoadingButton`/`LinkButton` (Button), `Loader`
  (progress), `StatusBadge`/`TagPill` (Chip). Don't import
  `@mui/material/Card` outside `AppCard`.
- **Colours live in the theme.** No hex/rgba literals in components (the
  shell and `DataTable/styles.ts` included): add a token to
  `src/theme/appTokens.ts` and read it from there.
- **`"use client"` only where needed.** A file that mixes server-safe
  primitives with one interactive piece splits the interactive piece into
  its own client file, so the rest stays usable from Server Components.
  One component per file; `DataDisplay.tsx` and `Skeletons.tsx` are the
  only deliberate groupings.
- **Ids for ARIA wiring** (`aria-controls`, `aria-labelledby`) come from
  `useId()`, never a fixed string: components are mounted more than once.
  Icon-only and repeated per-row buttons get an `aria-label` naming the row.
- **Stable grid inputs:** `DataTable` `columns`, `filters` and callbacks are
  module constants or memoised, not rebuilt on every render.
- **Loading** lives in `src/components/ui/Loading/` and every busy state is
  drawn by its `Loader`, so loading can be restyled in one place; never
  render `CircularProgress`/`LinearProgress` directly. `NavigationProgress`
  (mounted once in `app/layout.tsx`) shows a top bar for every internal link
  click, Back/Forward and router transition. Use `useAppRouter()` instead of
  `next/navigation`'s `useRouter` (its push/replace/refresh/back run in a
  transition that feeds that bar). A button that does async work is a
  `LoadingButton` (pass `loading`, or return a promise from `onClick`); a
  button that navigates is a `LinkButton` (spins until the route loads);
  form footers get both through `FormActions`.
- Pages (`src/app/**`) set **layout only** (Stack/Grid props, `alignItems`,
  `minWidth: 0`, `maxWidth`). No colour, typography, border, radius or shadow
  `sx`, no `@/theme` imports. Text colour via the Typography/Link prop
  `color="textSecondary"` — MUI v9 dropped the dotted `"text.secondary"` form
  for that prop and silently renders it as the default colour (dotted paths
  still work inside `sx`). If a
  page needs something visual twice, add it to the kit or the theme instead.
