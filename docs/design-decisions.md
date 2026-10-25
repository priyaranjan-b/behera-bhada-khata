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
`/dashboard/profile` (`changePassword`). Limits: `PASSWORD_LIMITS`
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
towers) on `/dashboard/properties`. It counts **current** tenancies only
(started on or before today and still holding the house), takes each
tenant's rent in effect this month and splits it **evenly across the houses
they occupy now**, then sums per tower (`round2`). A tower with no
occupants shows "—". Government tenants whose rent isn't tracked (D26) are left
out: that rent goes to the owner's bank, not through the app.

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

- **Tenant page → "Change history"** (`TenantChangeHistory.tsx`, streamed
  in with `Suspense` so the page doesn't wait): details, houses, rent,
  months, payments, documents and links sent, newest first.
- **House → History dialog** (`UnitsGrid.tsx`): occupants with formatted
  dates, plus the house's own changes and every tenancy started or ended in
  it (`unit_code` on the log row).
- **`/dashboard/activity`** (side menu "Activity"): everything, with a
  "Show" filter by category (`AUDIT_CATEGORIES`), a date range, search and
  Excel download. Pages of `AUDIT_LIMITS.pageSize` (50) and "Load older
  changes" (keyset on `id`).
- `AuditTimeline` (`src/components/domain/`) is the one timeline. It groups
  the entries of one transaction (`txId`) under one time + actor heading.
- **Text** comes only from `describeAuditEntry` (`src/lib/domain/audit.ts`):
  an action label, then "Field: old → new" for edits or "Field: value" for
  new or removed rows, every value through the app's formatters and label
  maps. A column not in its `FIELDS` list is never shown.
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
