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
- **Database:** `audit_history_page()` (0018) does the search, filters,
  sort and paging in one SQL query over the text stored with each change
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
- **Grows with time → server-side** (`paginationMode="server"`, an SQL
  `…_page()` function, A14's pattern). This covers history, payments and
  adjustments, rent months, and anything tenants × months. Done:
  Activity and a tenant's Change history (`audit_history_page`), the
  tenant's Months (`tenant_months_page`) and Ledger (`tenant_ledger_page`),
  and Billing (`billing_page` + `billing_totals`); D28 in
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
- The account read returns figures, not rows: one SQL aggregate,
  `tenant_account_summary` (0022, D29), gives the balance, the ended and
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
