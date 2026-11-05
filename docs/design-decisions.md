# Application design decisions

The *why* behind app-level choices outside the database: deployment, auth,
messaging, UI conventions. Database decisions (D1–D24) are in
[`database-design.md`](database-design.md); read that before touching the
schema.

Decisions here are numbered **A1, A2…** so they don't clash with the
database's D-numbers. If you change one, update this file in the same change
and say why. Add new ones at the end; never renumber.

---

## Deployment

### A1 — Vercel in Mumbai (`bom1`), next to Supabase

**Decision.** `vercel.json` sets `"regions": ["bom1"]`. The Supabase project
is in `ap-south-1` (Mumbai). Production URL: `https://myrenthq.vercel.app`
(`NEXT_PUBLIC_APP_URL`, and Supabase Auth's Site URL + redirect allow-list,
`…/auth/callback`).

**Why.** Every page makes several database round-trips; a function in the
default US region adds ~200 ms to each. The daily cron
(`/api/cron/ensure-periods`, 03:00 UTC) is in the same file.

**Notes.**
- Supabase **asymmetric JWT signing keys** are recommended: sessions are then
  verified locally instead of a call to Supabase Auth per request.
- The production database was migrated by hand (SQL editor). The Supabase CLI
  isn't installed; don't `supabase db push` onto it — run new
  `supabase/migrations/*.sql` files in order.

### A2 — Twilio is optional, even in production

**Decision.** `PRODUCTION_REQUIRED` in `src/server/env.ts` is only
`["CRON_SECRET"]`. `tenantMessagingEnabled()` says whether all `TWILIO_*`
vars are set; services pass it to the UI as `tenantMessaging` (on the
contracts in `src/lib/contracts.ts`) so screens hide or reword "send link"
and acknowledgement options. `sendConfirmOtp` returns **503** "Acknowledging
by SMS isn't available yet" when messaging is off (502 stays for a real send
failure). A production server without Twilio logs one warning at startup.

**Why.** The app launched before Twilio was set up. Since D20 a payment
counts when the owner records it; the tenant's SMS acknowledgement is
optional, so nothing about money depends on Twilio. Adding the five
`TWILIO_*` vars later and redeploying turns it on with no code change.

---

## Auth

### A3 — Owner password sign-in alongside the email magic link

**Decision.** `/login` has two tabs: **Password** (default) and **Email
link**. `POST /api/auth/password` → `signInWithPassword` in
`src/server/services/auth.ts` (Supabase `signInWithPassword`, sets the same
session cookies). The owner sets/changes the password on
`/profile` (`changePassword`). Limits: `PASSWORD_LIMITS`
(8–72; 72 is bcrypt's limit) in `src/lib/validation.ts`; rate limits
`RATE_LIMITS.passwordPerEmail` (10/h) and `passwordPerIp` (30/h).

- An email not in `OWNER_EMAILS` and a wrong password get the **same** 400
  "Wrong email or password" (no account probing).
- A valid non-owner account is signed straight back out and gets 403, so a
  stray account never keeps a session.
- Nothing else changes: RLS, `is_app_owner()` and `getOwnerContext()` are
  still the guard.

**Why.** Supabase's built-in email sender is heavily rate-limited, and the
owner wanted a plain password.

### A4 — Secrets are never committed or pasted

`CRON_SECRET`, `SUPABASE_SECRET_KEY` and Twilio credentials live only in
`.env.local` and Vercel env vars. A secret that appears in a chat, log or
commit must be regenerated.

---

## Branding

### A5 — "MyRentHQ" in the browser, "Behera Rent Book" in the app

**Decision.** Tab title `MyRentHQ` (`src/app/layout.tsx` metadata), icons
`src/app/icon.svg` and `src/app/apple-icon.png`. The app shell's
`BrandMark` (`src/components/shell/BrandMark.tsx`) reads "Behera Rent Book"
with the Odia name beneath (hidden in the mobile navbar). The repo / project
name stays Behera Bhada Khata.

---

## Privacy

### A6 — Real names stay local

`supabase/seed/arnapal_tenants.sql` (the register's occupants) and
`Arnapal Tenet House Number.xlsx` are gitignored. Never commit tenant names,
phones or the source spreadsheet; test fixtures use made-up names.

---

## UI & data display

### A7 — Status labels come from one helper

**Decision.** `statusLabel(status)` in `src/lib/domain/status.ts` turns a
ledger/period status (`partially_paid`) into words ("Partially paid").
`StatusChip`, grid `valueFormatter`s and exports all use it; tenant statuses
use `TENANT_STATUS_DISPLAY`, unit types `UNIT_TYPE_LABELS`.

**Why.** "Never show a raw enum value" (CLAUDE.md). Grids also export and
quick-search the *formatted* value, so the label must be on the column, not
only in `renderCell`.

### A8 — Excel download on every table, with our own .xlsx writer

**Decision.** `DataTable` has a "Download Excel" toolbar button, on by
default (`exportExcel`, opt out with `exportExcel={false}`). CSV
(`exportCsv`) stays off by default.

- `src/lib/xlsx.ts` is a small dependency-free writer: one sheet, a stored
  (uncompressed) zip, bold frozen header, auto column widths (8–60), numbers
  as real numbers (`#,##0` / `#,##0.00`), inline UTF-8 strings (Odia works).
  Tested in `src/lib/xlsx.test.ts` (CRCs checked against `node:zlib`).
- `src/components/ui/DataTable/exportExcel.ts` (`downloadGridAsExcel`)
  exports what the grid shows: rows after search, "Show" filters and sort,
  **across all pages**, and the visible columns. It skips `actions`
  columns, columns with `disableExport: true`, and the grid's internal
  checkbox/detail columns. File name: `<title> <yyyy-MM-dd>.xlsx`.
- Cell value, in order: the column's `exportValue(row)` → for `type:
  "number"` columns the raw number → otherwise the grid's formatted value
  (`valueFormatter`), booleans as Yes/No.
- Columns are typed `DataTableColDef<R>` (`columns.ts`) =
  `GridColDef<R> & { exportValue? }`. Use `exportValue` when the on-screen
  value is a `renderCell` or a search-oriented `valueGetter` (e.g. Tenant →
  display name, Houses → `"AC-T1-G01, AC-T1-G02"`). Give status/date/enum
  columns a `valueFormatter` so both the screen and the file show words and
  formatted dates. Per-row button columns get `disableExport: true`.
- Browser downloads go through `downloadBlob` (`src/lib/download.ts`).

**Why.** MUI X's Excel export is **Premium-only** (paid licence); the
community grid only has CSV and Print. A spreadsheet library (SheetJS,
ExcelJS) would add 300 KB+ to the client for one sheet of text and numbers.
The owner prefers Excel to CSV (numbers sum, Odia opens correctly, no
encoding prompt).

**If needed later:** multiple sheets, dates as real Excel dates, or
compression → extend `xlsx.ts` (or switch to a library then).

---

## Properties

### A9 — A tower's "monthly rent" splits each tenant's rent across their houses

**Decision.** `rentByProperty` (`src/server/services/placements.ts`) gives
`PropertyCard.monthlyRent` and `LocationGroup.monthlyRent` (sum of its
towers) on `/properties`. It counts **current** tenancies only
(started on or before today and still holding the house), takes each
tenant's rent in effect this month and splits it **evenly across the houses
they occupy now**, then sums per tower (`round2`). A tower with no
occupants shows "—". Government rent paid to the owner directly counts too
(A11).

**Why.** Billing is per tenant, not per house (one combined rent covers all
of a tenant's houses), so there is no per-house rent in the data. An even
split is the simplest rule that keeps the site total equal to the sum of the
tenants' rents when a tenant spans towers. It's an indicator of expected
rent, not money collected.

---

## Audit history

### A10 — Who changed what, and when: tenant timeline, house history, Activity page

**Decision.** The database records every change (D25); the app shows it in
three places and adds the events the database can't see.

- **Tenant page → "Change history" tab** (loaded when the tab first opens,
  A16): details, houses, rent,
  months, payments, documents and links sent. A table paged in the database
  (`AuditHistoryTable`, A14).
- **House → History dialog** (`UnitsGrid.tsx`): occupants with formatted
  dates, plus the house's own changes and every tenancy started or ended in
  it (`unit_code` on the log row).
- **`/activity`** (side menu "Activity"): everything, in the same
  `AuditHistoryTable` as the tenant page, with the tenant too: "Show" by
  category (`AUDIT_CATEGORIES`), a date range, search, sort, column filters,
  page numbers and rows per page, all done in the database (A14). Excel
  downloads the page on screen.
- `AuditTimeline` (`src/components/domain/`) is the house dialog's
  timeline, 50 at a time with "Show older" (keyset on `id`). It groups the
  entries of one transaction (`txId`) under one time + actor heading.
- **Text** is stored with each row when it is written (`title`, `details`,
  `actor_name`; D27): an action label, then "Field: old → new" for edits
  or "Field: value" for new or removed rows, every value formatted as the
  app does. A column not in `audit_describe()`'s list is never shown.
- **App events:** each link sent to a tenant (`notifyTenant`, delivered or
  not, never the text), each receipt download, sign-ins (password and email
  link), failed password sign-ins (the reason, whether the email was an
  owner's, a short IP hash), password changes and sign-outs. All
  best-effort.
- `recorded_by` on payments and adjustments is stored for the record. The
  timeline already shows who recorded each one, so the ledger has no extra
  column.

**Why.** The owner asked for the history of who lived in each house and
what rent was fixed, and for any other vital change to be kept. D7/D8
already held the dated facts; what was missing was *when it was entered, by
whom, and what it was before*.

---

## Billing

### A11 — Government rent paid direct counts as billed and collected

**Decision.** A government tenant whose rent isn't tracked (D26) pays the
owner's bank on time every month. Its agreement rent counts as **billed and
collected** for each month it holds its houses:
- **Which months:** from the lease month to the move-out month, at the rent
  in effect, never past the rent-month horizon.
- **How:** `paidDirectPeriods` (`src/server/services/periods.ts`, rules in
  `paidDirectMonths`, `src/lib/domain/billing.ts`) computes rent months that
  are already paid in full. Their ids come from `paidDirectId()`, so nothing
  mistakes them for ledger rows.
- **Where they're added:**
  - the Billing page (rows marked "Paid direct", Received);
  - the Overview: Expected/Collected, the billing chart, collection by site,
    tenant types, rent roll;
  - a tower's monthly rent (A9).
- **Never:** a row in `rent_periods`, a payment, arrears or Defaulters.
  Tracking it like any other tenant is still "Start tracking rent" (D26).
- **Off by default, every visit.** On the Overview and Billing it counts only
  while "Include Govt paid direct" is switched on. The switch sets
  `?paidDirect=show` on the page's URL (`PAID_DIRECT_PARAM`,
  `paidDirectViewOf` in `src/lib/preferences.ts`), and month and range links
  on the page keep it (`paidDirectQuery`). Nothing is remembered: opening the
  page again starts off. The API default is "hide" too
  (`paidDirectViewSchema`). This replaced a one-year cookie that kept it on.
  Since A24 the side menu's links between Overview, Billing and Earnings
  keep it on (`carryPaidDirect`); any other page, or a fresh visit, starts
  off again.

**Why.** The owner wanted this rent visible in the totals because it does
arrive every month. Rejected alternatives:
- **Storing a month and a payment each month** would mean entering
  bank-credit records nobody needs, or a job writing fake ones into the
  append-only ledger (D4).
- **Leaving it out** made rent roll and collection understate what the
  property earns.


## Overview

### A12 — The Overview streams in sections, one data call each

**Decision.** The Overview (`/`) is a set of independent **sections**, each loaded
by its own call and shown as soon as it is ready. A section has four parts:
- **Data:** a service function and a GET under `/api/dashboard/overview/*`
  (`month`, `trend`, `houses`, `attention`, `portfolio`, and `paid-direct`
  for the header switch, which needs only the tenant list; the defaulters
  card reuses `/api/dashboard/defaulters`). These live in
  `src/server/services/overview.ts`.
- **A section component** in `src/app/(app)/(overview)/sections/`: an
  async Server Component that awaits its promise(s) and renders the cards.
- **A slot** in `OverviewLayout.tsx`, plus its placeholder in
  `OVERVIEW_SKELETONS` (`overviewSkeletons.tsx`). A placeholder is one of the
  kit skeletons (`DetailCardSkeleton rows={n}`, `ChartCardSkeleton`, …) sized
  like the card, never a new component. `page.tsx` uses it as the section's
  fallback, and `loading.tsx` fills the whole layout with them, so the two
  can't drift.
- **A boundary:** `AsyncSection` (`src/components/ui/`), which is a
  `<Suspense>` inside a `CardErrorBoundary` (`catchError` from `next/error`).
  A section that fails shows its own "Try again" card. `redirect()` and
  `notFound()` still pass through.

**Pages that follow it:**

| Page | Calls |
|---|---|
| Overview | `overview/{month,trend,houses,attention,portfolio}`, `defaulters`, `paid-direct` |
| Tenant page | `tenants/[id]` (profile), `…/account`, `…/ledger`, `…/history` |
| Billing | `billing` (rows and totals), `billing/received`, `paid-direct` |
| Tower page | `properties/[code]` (header), `…/units`, `…/tenants` |

Every other page shows one list or one form, so it keeps a single call. The
audit is in `docs/plans/split-page-apis.md`.

How the pieces fit:
- **Start every call first.** `page.tsx` starts every call before anything
  awaits, so the calls run in parallel.
- **Key boundaries by their inputs.** Each boundary is keyed by what its
  data depends on (`monthKey`, the paid-direct view). Switching the month
  reloads only the month's cards.
- **Shared reads run once.** The tenant list, the `ensure_rent_periods`
  write, placements, rent months, and recent payments and adjustments come
  from loaders wrapped in React `cache()` in
  `src/server/services/loaders.ts`, a module of their own so any screen's
  service can use them. Within one render each runs once, however many
  sections need it. `getDefaultersReport` reads through them too:
  `recentPeriods()` (unpaid months plus the last `RECENT_MONTHS`) serves the
  month figures, the trend, the portfolio and the defaulters with one
  query.
- **No waits inside a section.** A section starts all its reads together.
  Only reads of rent months wait for the `ensure_rent_periods` top-up
  (`billedTenants()`). The tenant list, placements, payments and documents
  don't. Defaulters' payment lookup is its one dependent step, because it
  needs to know who is behind.
- **The session check is shared too.** `getSession` is cached per render,
  so the dashboard layout and every owner read share one `is_app_owner`
  call, and the layout reads the session and profile together.

**Rules for changing it.**
- **A new card whose data an existing section already loads:** extend that
  section's contract.
- **A new section and endpoint:** only for data with a different source, a
  different cost or a different refresh trigger (the selected month vs
  today).
- **Shared reads:** go through the cached loaders, never a section's own
  `db.*` call for the same rows.
- **Contracts:** per section and view-ready. Cards take the slice they
  render.
- **Size:** keep about 6-7 calls per page. More than that means the sections
  are too fine-grained.

**Why.** Before this, one `getDashboardSummary` call returned everything:
- the slowest part held back every card;
- one failure blanked the page;
- the defaulters logic was duplicated.

One call per card would instead repeat the base reads and the
`ensure_rent_periods` write on every call.

Rejected alternatives:
- **Client-side fetching** adds JS, only starts after hydration, and repeats
  auth.

Trade-offs:
- Over the HTTP transport (`API_BASE_URL`), `cache()` doesn't span requests,
  so each endpoint reloads the base data.
- Sections may read moments apart. That is fine for a dashboard. Never
  combine figures from two sections into one number.

## URLs

### A13 — Owner pages have no `/dashboard` prefix

**Decision.** Every owner page is at the root:
- the Overview is `/`;
- the rest are `/tenants/…`, `/properties/…`, `/houses`, `/billing`,
  `/defaulters`, `/activity` and `/profile`.

How it's built:
- **Folders:** the pages live in the `src/app/(app)/` route group. Its
  layout carries the shell (menu, top bar, breadcrumbs), and the group adds
  nothing to the URL.
- **Links:** every link is built through `routes` (`src/lib/routes.ts`).
  The menu tab (`tabForPath`) and the breadcrumbs (`ROUTE_LABELS`, rooted at
  "Overview" on `/`) read the same paths.
- **Sign-in:** the proxy protects every page except the public ones
  (`isProtectedPath`: `/login`, `/auth/*`, `/confirm/*`, `/api/*`). It fails
  closed, so a new page needs no entry to be protected. After sign-in,
  `?next=` brings the visitor back to the same page, query included.
- **Old links:** `next.config.ts` sends `/dashboard` and `/dashboard/:path*`
  to the same path without the prefix with a permanent 308, query kept.
  Redirects run before the proxy, so a signed-out old link lands on
  `/login?next=<new path>`.
- **The API keeps `/api/dashboard/…`.** Only the app calls it, and its tree
  still mirrors the pages.

**Why.**
- `/dashboard` meant nothing: Properties, Tenants and Billing aren't part of
  a dashboard, the Overview is.
- The prefix lengthened every link and put "Dashboard ›" at the start of
  every breadcrumb trail.
- Protecting one prefix also meant a page placed outside it was public by
  accident. The rule is now to protect everything but a short public list.

**Rejected:** keeping `/dashboard` and only renaming the crumb. That hides
the symptom, but the URLs are what the owner shares and bookmarks.


## Tables

### A14 — History tables page, sort and search in the database

**Decision.** The Activity page and the Change history table on a tenant's
page are one component, `AuditHistoryTable`
(`src/components/domain/AuditHistoryTable.tsx`, `source` = all or one
tenant). It sends its page, rows per page (10, 25, 50, 100; `GRID_LIMITS`),
sort, search, column filters, "Show" and From/To dates to
`GET /api/dashboard/activity` or `GET …/tenants/[id]/history`. It gets back
one page plus the counts (`AuditTablePage`: `total` matching, `all` for the
tenant or the whole log). Excel downloads the page on screen. There is no
"Load older changes": the page numbers cover the whole history.

How it's built:
- **Grid:** `DataTable` with `paginationMode="server"` also sets sorting and
  filtering to server mode and counts with `rowCount`. The table turns the
  MUI models into query params with `toGridQueryParams`
  (`src/components/ui/DataTable/serverQuery.ts`). Server-side text columns
  offer only `SERVER_TEXT_OPERATORS`.
- **Query:** `AuditTableQuery` = `GridQueryParams`
  (`src/lib/domain/gridQuery.ts`) + Show and dates, validated by
  `auditTableQuerySchema` (`gridQuerySchema` in `src/lib/validation.ts`).
  It checks every field, operator and page size.
- **Service:** `listActivity` / `tenantHistory` share one `historyPage`,
  which maps the table's fields to columns and makes one repository call,
  `audit.historyPage`.
- **Database:** one query (`queries/auditHistoryPage.ts` in the Drizzle
  adapter, A19; it replaced `audit_history_page()`, 0018) does the search,
  filters, sort and paging in one statement over the text stored with each change
  (D27 in `docs/database-design.md`). The tenant is optional, and the
  tenant's current name is joined in so it can be searched, filtered and
  sorted. What the database doesn't match isn't shown, and nothing is
  rebuilt or re-filtered in the app.

**Why.**
- Paging 50 rows in the browser made a long history look shorter than it
  is: page count, search and download covered only what had been loaded.
- With the text stored, the database can do all of it. A first version
  loaded the tenant's whole history and searched it in JS. That was
  replaced because it read every row on every request and kept a second
  copy of the query logic.

The house History dialog keeps its timeline with "Show older" (`before`,
50 at a time): it shows a handful of changes, grouped by `tx_id`.

### A15 — Lists that grow every month page in the database; master data pages in the browser

**Decision.** Which way a table pages depends on how its rows grow:
- **Grows with time → server-side** (`paginationMode="server"`, one paged
  query in `src/server/adapters/drizzle/queries/` on the `grid/` builder,
  A14's pattern, A19). This covers history, payments and adjustments, rent
  months, and anything tenants × months. Done: Activity and a tenant's
  Change history (`auditHistoryPage`), the tenant's Months
  (`tenantMonthsPage`) and Ledger (`tenantLedgerPage`), Billing
  (`billingPage` + `billingTotals`) and Payments (`paymentsPage`); D28 in
  `docs/database-design.md`. The client side of each is the kit hook
  `useServerGrid`.
- **Fixed by master data → client-side** (the service returns every row).
  This covers tenants, houses, towers, sites, and one-row-per-tenant
  reports (Overview status, Defaulters), and the bulk-upload preview.
  Some of these still read growing data behind a fixed-size table, worth
  trimming when touched:
  - Defaulters reads every payment of the tenants behind, for their last
    payment date;
  - `/houses` sends each house's full occupancy history;
  - the tenant account reads all payments and adjustments for
    `canStopRentTracking`.

The recipe is in the skills: `add-api-endpoint` ("A list that grows") for
the data side, `build-dashboard-page` ("Client-side or server-side
table?") for the grid.

**Why.**
- A growing list loaded whole gets slower every month.
- A list loaded in chunks ("Load older") makes page numbers, search and
  export cover only part of it.
- Master data stays in the hundreds, and paging it in the browser keeps
  search, sort and Excel instant without a query per keystroke.

### A16 — Record pages split into tabs by data source; tabs load when opened

**Decision.** The tenant page (`/tenants/[id]`) keeps the header (Edit,
Move out, Record payment), alerts and the two account stats above the fold,
and puts everything else in `PageTabs` (`src/components/ui/PageTabs.tsx`),
one tab per data source:

| Tab | Data | Loaded |
|---|---|---|
| Details (default) | the profile (`…/[id]`): details, house and rent history | with the page |
| Ledger | `…/ledger` | when first opened |
| Months | `…/months` | when first opened |
| Change history | `…/history` | when first opened |

A Govt tenant paying direct has only Details and Change history.

On phones the tab row is a full-width "Section" select. A table inside a
tab drops its own title there (`InTabsContext`): the select already names
it. The header puts Record payment full width on top, with Edit | Move out
sharing a row below (`ActionStack phone="primaryOnTop"`).

- **Lazy and kept.** A tab mounts the first time it is opened and stays
  mounted (hidden) after that. Its rows, page, sort and filters survive
  switching tabs with no new request: the kept component *is* the cache.
  `useMemo` couldn't do this, because it dies with the component.
- **Fresh after a write.** Every write already ends in `router.refresh()`
  or a redirect back. The page passes `version` (a token per server render),
  `PageTabs` keys the kept tabs by it, and only the open tab reloads.
- **`?tab=`** (`TAB_PARAM`, `TENANT_TABS` in `src/lib/routes.ts`) is
  written with `history.replaceState` (no server round trip), so a reload or
  link reopens the tab. Recording, adjusting or resending a link returns to
  `tab=ledger` (`recordedFlash`, `ResendButton`).
- **Tables load themselves.** `useServerGrid` takes `empty` instead of
  `initial` and fetches the first page on mount. `DataTable`'s skeleton
  loading overlay draws the real toolbar and columns meanwhile, so a tab
  needs no Suspense or fallback. Pages that render the first page on the
  server (Billing, Activity) still pass `initial`.
- **Skeletons live with their component.** A data component that renders
  several cells exports `<Name>Skeleton` from its own file (e.g.
  `AccountStatsSkeleton`), built from the kit primitives in `Skeletons.tsx`.
  The page's fallback and the `(profile)/loading.tsx` both use it.
- The account read returns figures, not rows: one aggregate statement,
  `queries/tenantAccountSummary.ts` (A19; was `tenant_account_summary`,
  0022, D29, dropped in 0029), gives the balance, the ended and
  paid month counts and whether tracking can stop. The page no longer reads
  any tenant's full months, payments or adjustments; those are in their
  tabs, one page at a time.

**Why.** Most visits are "open tenant → Record payment". The page used to
start five reads (profile, account, months, ledger, history) on every load
and scroll through all of them. It now starts two, and only the profile
blocks rendering.

**Apply it** to any record page with several growing tables: keep what the
common task needs above the tabs and give each data source a tab. A page of
independent cards (the Overview) still streams in sections (A12).

### A17 — Abuse limits on every layer: owner API, client IP, query time

**Decision.** Three limits, each cheap, so a stolen session, a runaway
script or someone calling Supabase directly can't wear the app down:

- **Owner API rate limit.** `ownerRoute` and `ownerLinkRoute`
  (`src/server/http.ts`) count every owner API call in the existing
  `rate_limits` table (`enforceOwnerRateLimit` in
  `src/server/services/context.ts`): `RATE_LIMITS.ownerApiPerMinute`, 300
  per minute per owner, then 429. The screens send a handful of calls per
  view, so only abuse reaches it. Pages rendered on the server call services
  in-process (`serverApi`) and aren't counted: they are already behind the
  session and one render is a bounded set of reads.
- **Client IP from the last `x-forwarded-for` hop** (`requestMeta`). Vercel
  overwrites the header with just the client; a proxy that appends puts the
  address it saw last. Earlier hops are whatever the client sent, so using
  the first one let anyone dodge the per-IP limits on login, OTP and
  confirm. Behind more than one proxy (e.g. Cloudflare in front of Vercel),
  revisit this.
- **Statement timeouts** (`0023_statement_timeouts.sql`): `authenticated`
  5s, `anon` 3s. The publishable key is public, so anyone can call PostgREST
  directly; RLS gives them nothing, but a slow query still costs the
  database.
- **Failing closed.** A rate limit that can't be counted (database or
  pooler down, or the login not yet allowed to act as `service_role`, D32) fails the call with a 500, on purpose: a
  limit that is skipped when the database is in trouble protects nothing,
  and an owner call that can't count a hit can't do its own reads either.
  With Drizzle each hit is its own short transaction (begin, role switch,
  the upsert, commit) on a pooled connection; a missing 0028 logs "run
  migration 0028".

**Not done here (yet).**
- A full Content-Security-Policy (`script-src` with nonces). Next.js nonces
  make every page dynamic and MUI's Emotion styles need the nonce too; worth
  its own change and a browser check of every page. `next.config.ts` sets
  the framing/base/object/form-action parts today.
- Edge rate limiting for page loads (`/login`, `/confirm/*`): Vercel
  Firewall rules, configured in the dashboard, not in code.
- Reads still call `ensure_rent_periods` (an idempotent insert). Fine at this
  size; the first thing to cache under heavy load.

**Why.** A security review of the data path (page → API → service → port →
adapter → PostgREST → RLS) found injection and data-access risk low (bound
parameters, whitelisted sort/filter columns, `like_escape`, RLS on every
table, explicit grants), but nothing limited authenticated calls or query
time, and the IP used for public limits could be spoofed.

### A18 — The Payments page: payments by day received, cards that follow the table

**Decision.** `/payments` lists every tenant's recorded payments by the day
they were received (`payment_date`), not the rent month they paid. It opens
on last month (whole calendar month, like Billing and the Overview); the
date form picks any days up to `PAYMENTS_LIMITS.maxDays` and the ‹ › arrows
move whole months by months, other ranges by their length
(`src/lib/domain/payments.ts`).
- **One call for the table and the per-mode cards.** The cards (Received,
  Cash, UPI, Bank transfer, Cheque & other) must add up exactly what the
  table finds under its search and column filters, so `payments_page()`
  (0026) returns the totals of every matching row with the page. A separate
  totals endpoint would have to repeat the grid's whole query.
- **Govt rent paid direct (A11) is its own card and call.** It is never
  recorded, so it has no date received: it counts by the rent months the
  days touch, up to this month, and the table's search doesn't apply.
- **Payments only.** Adjustments stay on the tenant's Ledger.
- **Server-paged (A15).** Payments grow every month; search and filters
  match the text shown (date as dd/MM/yyyy, mode label, "For months"),
  built in SQL (`payment_mode_label`, `audit_date`, `audit_month`).

**Why.** The owner wanted one place to see what came in, how, and when -
Billing answers "what was owed per month", not "what arrived on which day".

### A19 — A Drizzle data adapter, moved one port method at a time

**Decision.** `src/server/adapters/drizzle/` implements the data ports
(`src/server/ports.ts`), built on Drizzle ORM and postgres-js. It was built
next to the Supabase (PostgREST) adapter one port method at a time, with a
`DATA_ADAPTER` switch as the rollback, and replaced it in Nov 2026:
`src/server/adapters/supabase/` is now sign-in and file storage only.
Services, routes, contracts and the UI didn't change.
- **What moves and what stays.** Reads that only rebuild what the app
  already knows move to TS (`queries/`): the `…_page()` report functions,
  the grid helpers, label and status helpers, `tenant_account_summary`, and
  the rate-limit counter. Anything whose guarantee must hold for every
  writer stays in Postgres, called through typed wrappers (`procedures/`:
  named arguments, as `rpc()` passes them, so a reordered signature can't
  shift a value into the wrong parameter).
  That covers triggers (audit log, permanent codes, deposit, receipt
  numbers), `is_app_owner()` and RLS, and the money-moving and
  dated-history functions (`create_payment`, `create_adjustment`,
  `correct_rent`, the tenant lifecycle, `ensure_rent_periods`, D4/D5/D9).
  Those functions lock, check and write in one round trip, and they let the
  owner role keep its writes revoked.
- **Moved: every port method** (Nov 2026). The owner's reads (`tables/`,
  and `queries/` for the account figures and the six paged tables), the
  simple writes (`tables/`), the ledger and tenant-lifecycle writes
  (`procedures/ledger.ts`, `procedures/tenants.ts`), and the system side:
  rate limits, rent-month upkeep, the confirm link's lookups and
  acknowledgement, audit events (`procedures/system.ts`, `tables/`). Both
  repository builders satisfy the full port types, so a new port method
  can't be left on Supabase by accident.
- **The Supabase data adapter is gone** (Nov 2026, after a regression round
  on Drizzle): `db.ts` and its `must`/`mustWrite`/`chunk` helpers are
  deleted, `DATA_ADAPTER` with them, and `DATABASE_URL` is required. A
  rollback is now a revert of that commit. `ownerDb()` with no session is a
  401 (it used to fall back to the Supabase session client, which saw
  nothing).
- **The replaced SQL functions are dropped** (0029, D33): 30 functions the
  app no longer calls. Their rollback script
  (`supabase/rollback/0029_restore_replaced_functions.sql`) is also the parity tests'
  frozen oracle. Run 0029 only once no older deployment can
  serve traffic again.
- **Server-paged tables (`grid/`).** One builder turns the grid query
  (search words, text filters, and / or, sort, page) into the where and
  order by, replacing `grid_words`, `grid_check`, `grid_active_filters`,
  `grid_row_matches`, `like_escape` and `audit_text_matches` as the page
  functions used them. A table is described as SQL over one row: the text
  each filter reads, the search text, the sort expressions and a unique
  tie-break. Sort and field names only index into those maps, and every
  value is a bound parameter. The text the grid searches is built from the
  app's own sources (`queries/text.ts`): `DATE_FORMAT`, `formatMonth`'s
  wording, the label maps such as `PAYMENT_MODE_LABELS`, and today from
  `todayKey()` for which towers a tenant holds. A test compares each with the
  TS function the UI uses, so a label changed in TS changes what the search
  finds. A page is one statement (a materialised `matching` set feeding the
  count, the cards and the page, which is clamped in SQL), so it reads one
  snapshot under one `statement_timeout` in one round trip, as the SQL
  function did. Limits come from `src/lib/validation.ts` (`GRID_LIMITS`,
  `PAYMENTS_LIMITS`); a refused query logs which check failed, and a failed
  page names its range, page, sort and filter count, never the search text.
  The parity test for each page runs a matrix of searches, filters, sorts
  and pages against the SQL function it replaces.
- **The app's clock, not the database's.** "Today", "this month" and the
  billing horizon in these queries come from one read of `todayKey()` per
  statement (`RENT_LOOKAHEAD_MONTHS` ahead for the horizon), the clock the
  pages and `summarizeBalance` use, where the SQL functions read
  `app_current_month()`. Both are Asia/Kolkata, so they only disagree for a
  moment around midnight; the parity tests rely on that.
- **Same values as PostgREST.** Money reads back as a JS number, which is
  what PostgREST sends and what `src/lib/types.ts` declares (`number`, since
  Nov 2026; it used to say `string`). Dates are `yyyy-MM-dd` keys and
  timestamps ISO strings. The parity test for plain reads compares with
  Postgres' `json_agg` of the same rows, which is what PostgREST sends.
- **No chunking.** The Supabase adapter split long id lists (`chunk()`)
  because they went into a PostgREST URL, then merged and re-sorted in JS. A
  Drizzle query sends them as bound parameters, so it is one query and the
  database's `order by` (with a unique tie-break) is the order. Postgres
  allows 65,535 parameters per statement; these lists are a page's records
  or one record's months, a few hundred at most. Error labels name how many
  ids a list read had (`list payments of 26 tenants`), never row values.
- **Same database guarantees.** Every query runs through `inScope()`
  (`client.ts`): one transaction that switches to `authenticated` with the
  session's verified user id (`sessionJwtClaims()` in the Supabase auth
  adapter, read once per request), or to `service_role`. Only `sub` is
  passed on, because SQL reads nothing but `auth.uid()`, so no email or phone
  goes into a query or an error. It also sets the statement timeout (owner
  5s as in 0023, service role 8s as over the Supabase API, never unlimited;
  A17) and UTC. As a result, RLS, `is_app_owner()`, `auth.uid()`
  (the audit actor) and the function grants apply exactly as they do for the
  Supabase clients. `test/adapters/drizzle/client.test.ts` checks this.
- **Same shapes.** The column types in `schema/columns.ts` read back what
  PostgREST sent: numeric as a number, date as a `yyyy-MM-dd` key,
  timestamptz as an ISO string. `errors.ts` maps the user's mistakes
  (`BBK*`, constraints, `42501`) the way the Supabase adapter's
  `writeError` did. Unlike it, an outage (connection refused or timed out, pool full,
  statement timeout) is a 500, not "Couldn't save that". Drizzle's own error
  text, which lists the query's parameters, is never kept or logged.
- **The schema mirror never drives the schema.** Migrations stay
  hand-written SQL (A1). `schema/` mirrors them, and
  `test/adapters/drizzle/schema.test.ts` compares every column's name, type
  and nullability against a migrated PGlite. `drizzle.config.ts` is for
  `drizzle-kit pull`/`check` only, never `push`/`migrate`.
- **Each moved method has a parity test:** on PGlite, its result must equal
  the SQL function it replaces. 0029 dropped those functions from the
  database; a frozen copy, loaded only into test databases, stays the
  oracle (D33). Fixed expected values were the plan, but the test data is
  dated relative to today and ties sort by random uuids, so they would
  drift and flake. A case gets fixed values when its rules change on
  purpose.
- **Connection.** `DATABASE_URL` is Supabase's shared pooler in transaction
  mode (port 6543, IPv4, the serverless option), logged in as
  `app_drizzle.<project-ref>` (0027, D32): a role that can do nothing until
  `inScope()` switches it to `authenticated`, or (since 0028, for
  `systemDb()` only) to `service_role`. It never uses `postgres`.
  `DATABASE_URL` is a secret on a par with `SUPABASE_SECRET_KEY`: server-only
  (`env.ts` refuses a `NEXT_PUBLIC_` copy), and rotated by running
  `alter role app_drizzle password ...` again and updating it everywhere.
  `drizzle-kit` reads its own `DRIZZLE_KIT_URL`, never `DATABASE_URL`. Transaction mode means `prepare: false`, `ssl: "require"`, no
  session state (everything is `set_config(..., true)` per transaction) and
  no query pipelining. Postgres.js pipelines concurrent queries, so code
  inside `inScope()` awaits its queries one by one.

**Why.** The owner wanted type-checked data access that isn't tied to
PostgREST RPCs, without losing the integrity the ledger functions and RLS
give. Moving the money writes into app code would mean granting the app's
role writes on the ledger, and taking several round trips where one does
today.

### A20 — Overview: "Collected" is per rent month, "Received" is cash

**Decision.** The Overview's Collected card is what was credited to the
selected month's rent (`buildMonthlyReport`, `amount_allocated`), so it pairs
with Expected. The Billing vs Received chart is cash received in each month
by payment date (`buildBillingCollectionTrend`) and is labelled "Received".
The card shows the month's received amount on a second line, and its
sparkline is the received series.

**Why.** Both were labelled "Collected", so October 2026 read as ₹0 on the
card and ₹83,310 on the chart: every payment received that month paid
earlier months' arrears. Both figures are useful, so we kept both and gave
them different names.

### A21 — Phone app: an installable web app (PWA) that caches nothing

**Decision.** The app installs to the phone's home screen as a PWA instead
of a separate native app. `src/app/manifest.ts` (icons from
`scripts/generate-pwa-icons.mjs` into `public/icons/`), `viewport.themeColor`
and `appleWebApp` in `app/layout.tsx`. `public/sw.js` handles only page
loads: network first, and `public/offline.html` when there is no
connection. It never caches pages, API responses or files.
`ServiceWorkerRegistration` registers it in production builds only. The
manifest, worker, offline page and icons are excluded from the proxy
matcher, because the browser fetches them signed out. Phone extras:
`ShareReceiptButton` in the Ledger hands the receipt PDF to the share
sheet (WhatsApp). If the tap has expired while the PDF loads, it asks for
one more tap. `FileAttachmentsField` shows "Take photo" (camera capture) on
touch screens.

**Why.** The layout was already built for phones, and a PWA keeps one
codebase with instant updates. Native (React Native) would mean rebuilding
every screen and adding bearer-token auth. Nothing is cached because rent
figures must be live, and nothing of the owner's may remain on a shared
phone after sign-out. A Play Store listing, if wanted, wraps this same PWA
as a Trusted Web Activity.

### A22 — Set-off: rent the tenant settles by keeping back what the owner owes them

**Decision (0032).** The payment mode `set_off` ("Set-off (deducted by
tenant)") records the part of a rent the tenant kept back for money the
owner owed them - typically goods the owner bought from the tenant's shop.
The owner records the cash handed over as one payment and the amount kept
back as a second payment in mode `set_off`, whose note ("Deducted for") is
required. Both allocate to rent months through `create_payment` as usual,
so the month is paid and arrears fall.

- **Rent: counted. Cash: not.** Every "Received" figure is money that came
  in, through `cashOnly` / `isCashMode` (`src/lib/domain/payments.ts`): the
  Overview chart's Received bars and its "received in the month" note
  (`getOverviewTrend`), the Billing page's received figure
  (`getBillingReceived`), and the Payments page's Received card
  (`paymentsPage` totals). Set-offs keep their own total
  (`by_mode.set_off`, the Set-off card). Collected / allocated figures
  include them, because the rent is paid.
- **Not an adjustment.** An adjustment corrects a payment recorded wrongly
  (D4). A set-off is a payment made in kind: nothing was wrong, and it has
  its own receipt, which reads "Payment method: Set-off (deducted by
  tenant)" and "Deducted for: …".
- **To maintenance.** If what was bought went into the houses, the tenant
  page's flash after a set-off links to `/maintenance/new?fromPayment=`.
  That opens the form with the amount, date and note filled in, and the
  tenant as Paid to and Paid by (`getMaintenanceForm`, only for a set-off
  payment). The owner picks the houses and the category. The expense keeps
  the set-off that paid for it (`maintenance_expenses.settled_by_payment_id`,
  0032): only a set-off, for no more than its amount, one live expense per
  set-off, never changed (D36). **No cash went out for it**, so cash spent
  leaves it out: the Maintenance totals' `cash` (and `isCashExpense`,
  `src/lib/domain/maintenance.ts`). The earnings page will compute Net cash as
  cash received − that `cash`. Otherwise the ₹1,200 kept back would be
  subtracted twice: once as missing cash and again as an expense. Net per
  rent month still subtracts every expense.

**Why.** Recording the deduction as "Other" made it look like cash
received and said nothing on the receipt. Recording only the cash left the
tenant owing money they had in fact settled. A separate deduction column on
payments was rejected: two payments keep the ledger and allocations
unchanged, and each part gets its own receipt.

### A23 — Earnings: two nets, by rent month and as cash

**Decision.** `/earnings` (`src/server/services/earnings.ts`,
`buildEarnings` / `earningsTotals` in `src/lib/domain/earnings.ts`) shows,
per month for a range of months (default: the last 12, at most 24,
`EARNINGS_LIMITS`), what the rent book brings in once maintenance is paid:
- **Net (rent month)** = Collected (`amount_allocated` per rent month, the
  Overview's "Collected", A20) − every maintenance expense dated that month.
  It answers "did this month's rent cover the upkeep?".
- **Net cash** = Received (cash by payment date, A20, set-offs excluded, A22)
  − maintenance paid in cash (expenses not paid by a set-off, D36). It answers
  "what did I keep?". A set-off is in neither side, so the money a tenant
  kept back for goods the owner bought is never subtracted twice.
- **Spent of collected** = maintenance ÷ collected, of the totals.
- Govt rent paid direct counts as billed, collected and received in its own
  month (A11) unless the switch hides it, as on Billing.

It is one call (cards, chart and table are the same months) and one row per
month. With a cap of 24 rows, the table pages in the browser: an exception
to A15's "grows every month" rule, because the rows are monthly totals.
Maintenance per month is one grouped query (`maintenance.monthly`). Rent
months, payments and adjustments come through the shared loaders
(`periodsFrom`, `paymentsFrom`, `adjustmentsFrom`).

**Why.** Collected and cash differ whenever arrears are paid late, so
either one alone misleads: October can show a loss by rent month (nothing
credited to October yet) and a healthy net in cash. Per-tower and
per-house earnings need each tenant's rent split over their houses month by
month (the next step). Until then the page is for the whole rent book only.

### A24 — Report pages: a sticky context bar, not a global header control

**Decision.** The period switcher (‹ month ›), the range form and "Include
Govt paid direct" live in `ContextBar` (`src/components/shell/ContextBar.tsx`),
which the report pages render under their `PageHeader`: Overview, Billing,
Earnings, Payments and Maintenance. It is sticky under the top bar
(`TOPBAR_HEIGHT` / `MOBILE_NAVBAR_HEIGHT`), frosted like it, and full width
of the content column.
- **Desktop (`md`+):** the period on the left, the options inline on the
  right, wrapping to a second row when narrow.
- **Phones:** one row: the period and a "View options" button whose badge
  counts options switched on that the bar doesn't show (paid direct). It
  opens a `BottomSheet` with the options, stretched full width, and "Reset
  to defaults" while the URL has params. The sheet belongs to the URL it
  was opened on, so applying an option (a navigation) closes it.
- **Paid direct between pages:** the side menu's links to Overview,
  Billing and Earnings keep `?paidDirect=show` while the current page has it
  (`carryPaidDirect`, `src/lib/preferences.ts`). The period is not carried:
  each page's period is a different thing (one month, a month range with
  its own default, days).

**Why.** Asked to move both controls into the global top bar for every
page, disabled where they don't apply. Rejected because:
- they apply on 5 of about 27 pages, and controls greyed out on the rest
  read as broken;
- one global "month" can't stand for the Overview's month, Billing's and
  Earnings' ranges (different defaults) and the day ranges without
  translation rules that surprise;
- a remembered switch is what A11 removed (figures misread while it was
  left on);
- the top bar has no room: at `md` its side columns are ~90px, and the
  phone bar already holds brand, search, colour mode and menu;
- next to the page it reads as that page's view, not an app setting.
The sticky bar keeps what was wanted: the controls stay in reach while the
figures scroll, and the switch no longer resets between the report pages.

### A25 — Profile is the person; Settings holds the shared lists

**Decision.** `/profile` keeps only what belongs to the owner as a person:
a summary card (avatar, name, sign-in email, signature status, who signs
receipts), Owner details (name and signer, with a live "On receipts" line),
Receipt signature, and Security (password). The rent book's shared lists
move to a new `/settings` page (side menu, owner menu): **Payment tags**
(D34, offered on Record payment, Payments and Maintenance) and **Quick
payment notes** (D30). Both are `ListSettingCard`
(`src/components/domain/ListSettingCard.tsx`): where the list is used, the
add field first, a count against its limit, then the entries with rename
and delete. The API follows the pages: `/api/dashboard/settings/payment-
{notes,tags}` (the `apiPaths` keys kept their names). Section headings take
a coloured tile through `SectionCard tone`.

**Why.** The lists aren't about the owner, and under Profile they were hard
to find and mixed into one grid with the password form. A new list (e.g.
maintenance categories, if they ever become editable) goes on Settings as
another `ListSettingCard`.

### A26 — Money tables: a footer total that follows the filters; phones swipe the stat cards

**Decision.** Every table with money in it adds up its money columns in the
footer: `Total · Billed ₹1,20,000 · Collected ₹98,000 · Balance ₹22,000`.
The total covers every row the date range, "Show", search and column filters
leave, **on every page**, never just the page shown. A column opts in with
`moneyColumn(field, header, { total: true })` (or `total: true` on a plain
number column). The footer reads the visible columns, so a hidden column
drops out of it.
- **Client-side tables** (Earnings, Defaulters, Tenants, a tower's tenants,
  A15) add up the grid's filtered rows in the browser
  (`sumColumns`, `src/components/ui/DataTable/totals.ts`). Their Excel
  download ends with a Total row.
- **Server-side tables** (Payments, Maintenance, Billing, a tenant's Months
  and Ledger) get the sums from the same statement as the page: `sum()` over
  the paged query's `matching` set (A19), returned as `totals` keyed by the
  grid's fields and passed as `DataTable columnTotals`. The kit never adds up a
  server page itself. Their Excel download is one page (A8), so it gets no
  Total row, which would read as the whole table's.
- The footer stays while the table has rows, even when they fit one page
  (then without the pager), since a narrow filter is when a total is wanted.
- What's left out: the Ledger's **Balance** (a running balance, so its sum means
  nothing) and Defaulters' **Rent / month**. Payments' footer is the Amount
  column (set-offs included, noted), while its "Received" card is cash only
  (A22). Maintenance's leaves voided expenses out (D35) and says how many.
- **Not due yet.** The Ledger's Debit and Credit count only what its balance
  counts: rent for this month and later ("upcoming") and old pending records
  are listed but left out, and the footer says how many rows that is, so
  Debit − Credit never reads as more owed than the Balance. The Months
  table's Due is a plain column total that includes those months, and the
  footer notes how much of it is "not due yet". Billing's footer matches its
  cards, which count the whole range too.

**Why not the cards.** The cards are the page's figures, and several of them
deliberately don't follow the table: "Received" leaves out set-offs, "Govt
paid direct" ignores the table's search (A11). The footer is the table's own
sum, next to the rows it adds up, the status-bar pattern from spreadsheets
and accounting apps. A totals row lined up under the columns would need MUI X
Pro/Premium (pinned rows, aggregation), and a fake one breaks when columns
are hidden, reordered or scrolled sideways.

**Phones.** `StatCard` is tighter on phones on every page (12px padding,
one-line title, a caption of two lines at most). `StatCardRow`
(`src/components/ui/StatCardRow.tsx`) lays a page's cards out as one
swipeable row on phones and as a grid from `sm` up. On phones it shows two
whole cards and about a quarter of the next (`(100% - 2 gaps) / 2.25`, at
least 128px), fades the right edge, and puts the page's headline card
(`StatCard variant="gradient"`, marked `data-emphasis`) first, by CSS `order`
only, so the DOM, screen readers and the `sm`+ grid keep the page's order.
Titles get two lines, so "Most on Electrical" or "Govt paid direct" isn't
cut. Not one card per slide: these figures are compared side by side, few
people swipe past a carousel's first slide, and a full-width card is no
shorter. Every page with a row of stat cards uses it (Overview,
Billing, Payments, Earnings, Maintenance, Defaulters): on Payments seven cards
took four rows above the table and now take one, and four cards take one row
instead of two. Each page sets its columns per breakpoint in one constant
(`STAT_COLUMNS`, `BILLING_STAT_COLUMNS`, `PAYMENT_STAT_COLUMNS`, ...), shared
with its skeletons; a section that streams several cards returns them bare and
they join the row (an `AsyncSection` adds no element); it is `wide`, so if
it fails its one error card spans the row instead of leaving a gap. The tenant page's
account figures stay a two-a-row grid: they sit in the record header.

**The Overview on phones** (everything below the stat row is a stack of
full-width cards, about 3,400px):
- **Same order as desktop:** stat row, the Billing vs Received chart, Needs
  attention, Top defaulters, then the reference cards. The DOM is that order,
  so keyboard and screen-reader order match the screen (no CSS `order`).
- **Every card below the chart collapses** (`SectionCard collapseOnPhone`):
  its heading or chevron opens and closes it, and its action hides while
  it's closed. Needs attention and Top defaulters start open (`startOpen`:
  they're what the owner acts on); Collection by site, Tenant types and
  Portfolio start closed. A card the owner opened or closed stays that way
  when the month changes (the section remounts; `phoneOpenByTitle` keeps the
  choice for the tab's life). Lists show in full when open: no "Show N
  more" (Needs attention can hide one item at most, and Top defaulters
  already has "See all").
- **Shorter chart:** 180px instead of 260px, set in CSS on the chart's box
  (`TREND_CHART_HEIGHT`, read by its skeleton too), so it doesn't resize after
  load. The skeletons match the phone layout as well (`collapseOnPhone` /
  `startOpen` on `DetailCardSkeleton` / `ChartCardSkeleton`).

`collapseOnPhone` hides in CSS (`display` below `sm`), not with a JavaScript
width check, so the server's page is already right on a phone and nothing
jumps on load; from `sm` up it is a no-op. The period switcher fills the
phone's context bar up to the "View options" button, so the bar has no
empty gap.

### A27 — Old confirm links and password changes (tech-debt S1, S4)

**Decision.**
- **Confirm links expire after use too.** A tenant's `/confirm/<token>` link
  works until its token expires while unacknowledged, and for
  `ACKNOWLEDGED_LINK_SECONDS` (14 days) after the tenant acknowledges, so they
  can fetch their signed receipt again. After that the page and the receipt
  download treat it as expired, and an expired link returns only
  `{ recordType, isExpired: true }` (`ConfirmExpired`): no name, houses,
  amounts or note. The owner can still download and share the receipt. No
  SQL change: `confirm.ts` checks `acknowledged_at`.
- **Changing the password needs the current one**, checked with
  `signInWithPassword` against the owner's email and rate limited
  (`passwordChangePerOwner`), **except within
  `PASSWORD_LIMITS.recentSignInMinutes` (10) of signing in**, read from the
  verified token's `amr` timestamps (`AuthGateway.signedInAt`), which a token
  refresh keeps. A session whose sign-in time can't be told counts as old.

**Why.** An old link (forwarded on WhatsApp, in a shared phone's history)
kept serving the signed receipt with its payment proofs, and an expired one
still showed the tenant's details. A stolen session cookie could set a new
password and keep the login after the session was revoked. Always requiring
the current password would stop an owner who has only used email links from
ever setting one; the recent-sign-in window ("sudo mode") covers that, since
signing in again proves the email. Supabase's emailed reauthentication code
would be stronger but needs a dashboard setting and an extra form step.

### A28 — Every figure opens the data it comes from

**Decision.** A card, chart or summary row that shows a figure links to the
page holding the records behind it, for the same period:
- **Another page:** the Overview's cards (Billing for the month, Defaulters,
  overdue tenants, vacant houses), a Billing vs Received month (its bars, or
  the month in the table view) to Billing for that month, Billing's Received
  to Payments for the range's days (`dayRangeOfMonths`), Earnings' Collected,
  Received and Maintenance to Billing, Payments and Maintenance for its
  months, Payments' Govt paid direct to Billing for those rent months with
  paid direct shown, the tenant page's Outstanding and Months overdue to its
  Ledger and Months tabs, Collection by site to the site's towers
  (`routes.properties.site`), and Portfolio's rent roll, occupancy and paid
  direct to the Tenants and Houses lists.
- **The same page** (a card above its own table): the card filters that
  table to what it counts, and tapped again clears it. On Payments, Received
  shows every cash mode (no set-offs, A22) and each mode card its mode; on
  Maintenance, "Most on …" its category and "Paid by …" that payer; on
  Defaulters, each band card its band. A card that filters is a toggle
  (`StatCard onClick` + `selected`: `aria-pressed` and an outline), setting
  the column filter through `useServerGrid`'s `setFilter` with
  `toggleCardFilter` (it replaces only that column's filter). Defaulters'
  cards are server-rendered, so there the band is the URL's `?band=`
  (`routes.defaultersBand`), which the table's "Show" reads and writes too;
  its "Show" options are now the cards' four bands, not "2+ / 4+ / 7+".
  Payments' and Maintenance's cards follow the table's filters (A18), so with
  "Cash" on, the other mode cards read ₹0 until it's cleared.
- **No link:** a total of the table already on screen (Billing's Billed,
  Collected and Balance; Maintenance's Spent), figures that are computed
  rather than recorded (Earnings' nets, Spent of collected), and two with no
  matching filter yet: "Payer not tagged" (the Paid by column has no "is
  empty") and Tenant types (the Tenants list can't filter by type).

**Why.** A figure the owner can't open is a dead end: the next question is
always "which ones?".
