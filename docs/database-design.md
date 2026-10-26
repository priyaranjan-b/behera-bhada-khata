# Database design decisions

The *why* behind the Postgres schema in `supabase/migrations/`. Read this before
adding or changing a table, column, constraint, policy or SQL function. The
migrations themselves are the *what*; `src/lib/types.ts` mirrors them for
TypeScript.

If you change a decision here, update this file in the same change and say
why.

---

## 1. The data model at a glance

```
app_owner            the single account that owns the rent book (one row)
  └ owner_profile    the owner's name, the signer's name and saved signature (one row)

locations            AC          Arnapal Chakk Complex          (site)
  └ properties       AC-T1       Tower 1                        (tower)
      └ units        AC-T1-G01   floor G, commercial            (house / shop / room)

tenants              uuid        a person, business or government office (D26)
  ├ tenant_units     which houses, from - to     (occupancy history)
  ├ tenant_rent_rates combined monthly rent, from month M  (rent history)
  ├ tenant_documents ID proof, photo, agreement... (files, D21)
  ├ rent_periods     one row per tenant per month owed
  ├ payments  ─ payment_allocations    ─┐  append-only ledger,
  │            payment_proofs          │  (files attached to a payment)
  └ adjustments ─ adjustment_allocations ┘  confirmed when recorded (D20)

audit_log            every change to the tables above + app events (D25; append-only, no FKs)
```

| Migration | Adds |
|---|---|
| `0001_init.sql` | tenants, rent_periods, ledger tables, grants (applied in production; never edit) |
| `0002_units_and_search.sql` | unit columns on tenants (later replaced by 0006) |
| `0003_single_owner.sql` | `app_owner`, `is_app_owner()`, owner-free RLS |
| `0004_ledger_integrity.sql` | transactional ledger functions, rate limits |
| `0005_storage.sql` | private `rent-register` bucket |
| `0006_property_master_data.sql` | sites/towers/houses, tenancies, rent rates, tenant lifecycle functions |
| `0007_draft_tenants.sql` | draft tenants (from the paper register); drops `units.register_note` |
| `0008_billing_start.sql` | `tenants.billing_start` separate from `lease_start`; "rent paid up to"; security deposit |
| `0009_payment_proofs.sql` | `payment_proofs` (photo/PDF attachments of a payment, written by `create_payment`); bucket takes photos, 4 MB |
| `0010_instant_confirmation.sql` | payments/adjustments count when recorded; tenant sign + OTP becomes an optional acknowledgement (`acknowledged_at`); ledger writable only through `create_*` |
| `0011_tenant_documents.sql` | `tenant_documents`: ID proof, photo, agreement... on a tenant, with a free-text type |
| `0014_correct_paid_through.sql` | `correct_paid_through()`: fix an active tenant's "rent paid up to" |
| `0013_owner_profile.sql` | `owner_profile`: the owner's first/last name, who signs on their behalf, and that signer's saved signature |
| `0012_receipt_numbers.sql` | receipt numbers: `payments.receipt_no` (2026/10/001), `adjustments.receipt_no` (ADJ/2026/10/001), `receipt_counters` |
| `0015_audit_log.sql` | `audit_log` written by `audit_row_change()` triggers and `log_event()`; `recorded_by` on payments, adjustments, documents, tenancies and rent rates |
| `0016_government_tenants.sql` | `tenants.tenant_kind` and `rent_tracked`: government tenants whose rent goes to the owner directly (no months until `start_rent_tracking`) |
| `0017_audit_text.sql` | `audit_log.title` / `details` / `actor_name`: the history's text, written on insert by `audit_describe()` (D27); `tenant_history_page()` for the tenant's Change history (A14) |
| `0018_audit_history_page.sql` | `audit_history_page()` replaces `tenant_history_page()`: the tenant is optional (Activity), and the tenant's name is searchable, filterable and sortable (A14) |
| `0019_tenant_months_page.sql` | grid helpers (`grid_check`, `grid_row_matches`, ...), `period_display_status()`, `tenant_months_page()` for a tenant's Months (D28) |
| `0020_tenant_ledger_page.sql` | `tenant_ledger_page()`: a tenant's journal and running balance, built and paged in SQL; replaces `buildTenantLedger` (D28) |
| `0021_billing_page.sql` | `billing_page()` / `billing_totals()` for the Billing grid and cards, paid-direct months in SQL, `tenant_placement_now()`, index `rent_periods (period_month)` (D28) |

Seeds, in order:
- `supabase/seed/arnapal_master_data.sql`: claims ownership and loads 2 sites, 7 towers and 40 houses. This is master data only.
- `supabase/seed/arnapal_tenants.sql`: the 26 occupants from the register, as draft tenants holding 35 houses. Gitignored (real names), so it exists only on the owner's machine; `test/schema.test.ts` skips its check when it's absent.
Reset of test data: `supabase/scripts/reset_owner_data.sql` (destructive, manual, never a migration).

---

## 2. Decisions

### D1 — Single owner: `app_owner` + `is_app_owner()`, no `owner_id` columns

**Decision.** There is exactly one owner. Their auth user id is stored once
in `app_owner`, a single-row table (`singleton boolean primary key check
(singleton)`). Every RLS policy and every owner-facing function checks
`is_app_owner()`. No table has an `owner_id` column.

**Why.** Per-row `owner_id` was multi-tenant machinery (composite foreign
keys, filters on every query) for a rent book that has one owner. Simply
dropping it would have made the policies "any signed-in user sees
everything", so the owner check moved into the database instead.

**Consequences.**
- **It fails closed:** with no `app_owner` row, nobody can read or write
  anything. The seed claims ownership, and changing the owner is a deliberate
  `UPDATE app_owner` run by hand.
- **The browser roles never read `app_owner`.** `is_app_owner()` is
  `SECURITY DEFINER` and is the only way in.
- **The app also gates on it.** `getOwnerContext()` (in
  `src/server/services/auth.ts`) returns 403 for a signed-in non-owner, and
  `serverApi` redirects them to `/login?error=owner`. The database check is
  the authoritative one; the app check only gives a clear message.
- **If the app ever needs several owners,** add `owner_id` back deliberately,
  with composite foreign keys `(code, owner_id)` so cross-owner references are
  impossible. Don't half-do it with app-side filters.

### D2 — Places use natural keys, and the keys are permanent

**Decision.** `location_code` (`AC`), `property_code` (`AC-T1`) and
`unit_code` (`AC-T1-G01`) are the primary keys, and child tables reference
them directly; there is no surrogate uuid. The `prevent_key_change()` trigger
rejects any update of a code, and foreign keys are `ON UPDATE RESTRICT`.

**Why.** These are the codes the family already uses on paper and on
receipts. They read well in URLs (`/properties/AC-T1`) and need no
join for display. The one weakness of natural keys is renaming, so renaming
the key is forbidden: change `name` instead.

**Enforced by CHECKs:**
- **Uppercase format:** `^[A-Z]{2,4}$`, `^[A-Z]{2,4}-T[A-Z0-9]{1,3}$`,
  `…-[A-Z0-9]{1,4}$`.
- **Child codes start with the parent's code:**
  `property_code LIKE location_code || '-%'`.
- **`tower_code` and `house_number` are generated columns** taken from the
  code, so they can't disagree with it.

**Houses are pure master data.** A house describes the place (code,
floor, type, label, `is_active`), never who is in it. Occupants are tenants,
linked by `tenant_units`. An early version stored the register's occupant
names in `units.register_note`; 0007 dropped it and turned those names into
draft tenants (D16).

### D3 — People and money keep uuids

**Decision.** `tenants`, `rent_periods`, `payments`, `adjustments` and the
allocations use uuid primary keys.

**Why.** People have no stable natural key: names repeat and phone numbers
change. Ledger rows are immutable facts that need ids unrelated to anything a
person might want to edit.

### D4 — The ledger is append-only

**Decision.** Payments and adjustments are never updated or deleted. A
mistake is corrected with a new `adjustments` row pointing at
`original_payment_id`; like a payment it counts when recorded, and the
tenant may acknowledge it (D20). `authenticated` has `INSERT` (since 0010),
`UPDATE` and `DELETE` revoked on every ledger table, except for a
column-level grant on `token_hash`/`token_expires_at`, used to send a link
until the tenant acknowledges.

### D5 — Every multi-row or money-moving write is one SQL function

**Decision.** `create_payment`, `create_adjustment`, `acknowledge_payment`,
`acknowledge_adjustment`, `create_tenant`, `update_tenant`,
`move_out_tenant` and `ensure_rent_periods` each run in one transaction and
check their own invariants. The app never does read-modify-write on money
in JS.

**Why.** Early versions inserted a payment and its allocations in two calls,
and confirmed by reading `amount_allocated` in JS and writing it back. That
caused lost updates under concurrency, half-written records on failure, and
unchecked allocations sent by the client.

**Invariants the functions enforce:**
- allocations sum to the payment or adjustment amount, belong to that
  tenant or to the original payment's months, and aren't duplicated;
- `0 ≤ amount_allocated ≤ amount_due` on every month, also backed by a
  `CHECK … NOT VALID` constraint;
- `create_*` lock the affected `rent_periods` rows (`ORDER BY id FOR
  UPDATE`) *before* checking what's still owed, then do
  `amount_allocated = amount_allocated + delta` (D20), so two payments
  recorded at once can't both fit the same month;
- `acknowledge_*` is a compare-and-swap on `acknowledged_at is null`, so a
  racing second acknowledgement returns false (and moves no money).

### D6 — User-facing errors have their own SQLSTATEs

`BBK00` → HTTP 400 (bad input), `BBK04` → 404 (not found / not allowed),
`BBK09` → 409 (conflict with existing state). Messages raised with these are
written for the person using the app. `writeError()` in
`src/server/adapters/supabase/clients.ts` maps them, logs any other database
error, and returns a generic message.

### D7 — Occupancy is dated history, never overwritten

**Decision.** `tenant_units (tenant_id, unit_code, start_date, end_date)`.
`end_date` is the last day, inclusive; null means the tenant is still there.

```sql
exclude using gist (unit_code with =, daterange(start_date, end_date, '[]') with &&)
```

**Why.** Tenants leave and houses are re-let. An exclusion constraint
(`btree_gist`) makes "one occupant at a time" a database guarantee while still
allowing back-to-back tenancies (one ends 30 Sep, the next starts 1 Oct). The
`unit_occupancy` view (`security_invoker = true`) answers "who lived where,
when".

### D8 — Rent is per tenant, combined, and versioned

**Decision.** Billing is per tenant: one `rent_periods` row per tenant per
month, whatever number of houses they hold. The combined monthly rent lives
in `tenant_rent_rates (tenant_id, effective_month, monthly_amount)`, and
`rent_for_month()` picks the latest rate on or before a month.

**Rules.**
- A rent change "from month M" re-prices only already-created months ≥ M
  that have **no allocation at all**, confirmed or pending. If such a month
  already has a payment, the change is rejected (`BBK09`): pick a later month
  or record an adjustment. Months touched by money are never re-priced.
- `rent_periods.amount_due` is a snapshot, so history is stable even if
  rates change.

### D9 — Tenant lifecycle functions are SECURITY DEFINER, with an explicit owner check

`create_tenant`, `update_tenant` and `move_out_tenant` write tables the owner
role cannot write directly (`tenants`, `tenant_units`, `tenant_rent_rates`,
and deleting `rent_periods`). They are `SECURITY DEFINER`,
`set search_path = public`, and **start with `if not is_app_owner() then
raise … 'BBK04'`**. Any new definer function must follow the same pattern.

**What each one does:**
- **`update_tenant`** receives the full new state. It diffs the house set:
  houses that are removed get `end_date = effective - 1`, added ones start on
  the effective date, and kept ones are untouched.
- **`move_out_tenant`** ends every open tenancy, sets `status = 'inactive'`
  and `moved_out_on`, and deletes only untouched rent months after the
  move-out month. Dues up to then stay on the ledger.
- **`ensure_rent_periods`** never bills past `moved_out_on`.

### D10 — Retire, don't delete

Houses have `is_active`. Every foreign key is `ON DELETE RESTRICT`.
`authenticated` has `DELETE` revoked on `locations`, `properties` and `units`.

### D11 — Grants are explicit for every function

Supabase grants `EXECUTE` on new functions in `public` to `anon` and
`authenticated` by default. Every migration that creates a function ends
with `revoke all on function … from public, anon, authenticated` and a narrow
`grant execute … to authenticated | service_role`.

**Who may run what:**
- **Owner-facing (`authenticated`):** `create_*` (`SECURITY DEFINER` with
  the owner check since 0010) and the tenant lifecycle functions.
- **Service role only:** `acknowledge_*`, `ensure_rent_periods`, the
  rate-limit functions, `rent_for_month`.

### D12 — Rate limits live in Postgres

The `rate_limits (key, window_start, count)` table plus `hit_rate_limit()`
form a fixed-window counter, written only by the service role and pruned by
the daily cron. This avoids adding Redis for a small app. It's used for OTP
sends, confirm attempts and magic-link emails.

### D13 — Indexes match real queries; no duplicates

- **No duplicate indexes:** a `UNIQUE` constraint already creates an index,
  so don't add another on the same leading columns. Migration 0006 dropped
  five such duplicates.
- **Index every foreign key you filter or join on.** Postgres doesn't do it
  automatically.
- **Dashboard indexes:** `payments (tenant_id, payment_date)`,
  `adjustments (tenant_id, confirmed_at)`, and the partial
  `rent_periods (tenant_id, period_month) WHERE status <> 'paid'`.

### D14 — Money and dates

- **Money** is `numeric(12,2)` and validated to whole paise. JS rounds
  through `round2()`.
- **Months** are `date` values on the first of the month (`period_month`,
  `effective_month`), checked by `CHECK (x = date_trunc('month', x))`.
- **"Today" and "this month"** are in Asia/Kolkata (`src/lib/dates.ts`). SQL
  receives explicit dates from the app; avoid `current_date` in business
  rules except in the `is_current` display column.

### D15 — Migrations are append-only; tests run them for real

- **Never edit a migration that has been applied anywhere.** Add a new one.
  Unapplied ones may be rewritten, which is why 0003–0006 were renumbered
  before their first deploy.
- **Destructive rebuilds carry a guard** that refuses to run on non-empty
  tables (see the top of 0006). Resetting data is a separate, manual script.
- **`test/schema.test.ts` runs every migration plus the seed** against PGlite
  (in-process Postgres with `btree_gist`), with stubs for Supabase's `auth`
  schema and roles. It exercises functions as `authenticated` (RLS on) and as
  `service_role`. **Every schema change needs a case there.**
- **`src/lib/types.ts` is hand-maintained.** Update it in the same change;
  `npm run db:types` generates the real types for comparison.
- **`COMMENT ON` new tables and non-obvious columns,** so Supabase Studio
  documents itself.

### D16 — Draft tenants: known occupant, details pending

**Decision.** `tenants.status` is `draft | active | inactive`.

- **A draft** holds its houses through normal `tenant_units` rows, so the
  exclusion constraint keeps anyone else out. It may lack a phone, a rent
  rate and a lease start, and it is **never billed**: `ensure_rent_periods`
  skips it, and it has no rent months, so it can't take payments.
- **CHECK constraints** require `phone` and `lease_start` only when
  `status = 'active'`.
- **`update_tenant` on a draft** saves whatever details are given and
  replaces the house set outright (nothing was billed, so there's no history
  to preserve). When the phone, `p_monthly_rent` and `p_lease_start` arrive
  together, it turns the draft active: its houses start on the lease start,
  `billing_start` is set from `p_paid_through` (D17), the first rent rate is
  written, and billing begins. Rent without a lease start (or the reverse) is
  refused (`BBK00`).
- **`move_out_tenant` on a draft** just ends its houses.

**Why.** The paper register says who is in each house but not their phone,
rent or lease start. Placeholder values (a fake phone, ₹1 rent) would be bad
data that silently gets billed or messaged. A draft says "known occupant,
not billable yet" explicitly, and the app lists drafts so they get completed.

### D17 — Billing start is separate from lease start

**Decision.** Two dates, two meanings:
- **`lease_start`** is history: when the tenant moved in. It dates their
  `tenant_units` rows.
- **`billing_start`** (first of a month) is the first month this app bills.
  `ensure_rent_periods` generates months from `billing_start`, and the first
  rent rate takes effect from it.

The owner enters **"rent paid up to <month>"**: `billing_start_for(lease_start,
paid_through)` = the month after it, never before the lease month. With no
"paid up to", it's the lease month (a brand-new tenant), or last month when
completing a draft, so billing starts this month. `billing_start` is set once,
when a tenant is created or a draft is completed. It's required for active
tenants (CHECK) and null on drafts.

**Why.** Register tenants moved in years ago. Billing from the lease start
would create years of rent "due" that was actually paid on paper: fake
arrears. The owner chose "paid up to" over an opening-balance amount: what was
settled before the app stays in the paper book, and the app starts clean from
the month after. The form warns before saving if billing would start more
than three months back, showing how many months and how much would fall due.

### D18 — The security deposit is fixed once the tenant is active

**Decision.** `tenants.deposit_amount numeric(12,2)` is optional, and must be
`> 0` when present.
- **Where it can be set:** when onboarding (`create_tenant`), or freely while
  the tenant is a draft (`update_tenant`; null clears it).
- **After that it's frozen,** enforced twice:
  - `update_tenant` refuses a different value for a non-draft (`BBK09`),
    while re-sending the stored value or null is fine;
  - the `tenants_deposit_frozen` trigger refuses any `UPDATE` of
    `deposit_amount` once `status` isn't `draft`, so no other code path (a
    future function, the SQL editor) can change it.

**Why.** The deposit is an agreed money fact between owner and tenant, like a
ledger entry: once the tenancy is "submitted", changing it silently would
rewrite history. It's informational, so it doesn't enter `rent_periods` or
payments. If refunds or deductions are ever needed, model them as their own
append-only records, not as edits to this column.

### D19 — Payment proofs are ledger attachments, written with the payment

**Decision.** The owner may attach photos or PDFs (a UPI screenshot, a
cheque, a bank slip) when recording a payment. Each file is one
`payment_proofs` row (`storage_path`, `file_name`, `content_type`,
`size_bytes`). The files are stored in the private `rent-register` bucket
under the payment's own folder, `payments/<tenant>/<payment>/proofs/`.
`create_payment` takes them as `p_proofs` (default empty) and inserts them
in the same transaction as the payment.

**Rules.**
- **Append-only, like the rest of the ledger (D4).** Only `create_payment`
  writes them (since 0010 the owner has no direct `INSERT`), and
  `UPDATE`/`DELETE` are revoked. A wrong proof is explained in an
  adjustment, not swapped out.
- **Paths are checked in SQL.** `create_payment` refuses (`BBK00`) a path
  that isn't under that payment's folder, so a row can never point at
  another record's files.
- **Types are an allow-list in two places.** The table CHECK lists JPEG,
  PNG, WebP, HEIC/HEIF and PDF, and so does the bucket's
  `allowed_mime_types`. The app identifies the type from the file's first
  bytes, never from its name or the browser's claim.
- **Limits.** The app allows 5 files and 4 MB in total per payment, so one
  request stays under Vercel's 4.5 MB body limit; the form compresses photos
  in the browser first (visually lossless WebP/JPEG, at most 2560px). The SQL
  ceiling is 10 files, and the bucket's limit is 4 MB per object.
- **Orphans are cleaned up by the app.** Files are uploaded before the
  database call; if `create_payment` fails, the service removes them.
- **Viewing.** The tenant ledger lists each payment's proofs;
  `GET /api/dashboard/payments/[paymentId]/proofs/[proofId]` checks the proof
  belongs to that payment and redirects to a 5-minute signed URL. The bucket
  stays private.

**Why.** A proof is a fact about the payment at the time it was recorded,
so it belongs in the same transaction and has the same immutability.
Storing paths in a column on `payments` would cap the count and make the
column's shape a jsonb blob without constraints.

### D20 — A payment counts when the owner records it; the tenant's signature is optional

**Decision (0010).** `create_payment` and `create_adjustment` insert the
row as `status = 'confirmed'` (with `confirmed_at`) and apply its
allocations to `rent_periods` in the same transaction. The tenant's
signature + SMS OTP on `/confirm/[token]` is now an *acknowledgement*:
`acknowledge_payment` / `acknowledge_adjustment` (service role) record
`tenant_signature_path`, `otp_verified_at`, the tenant-signed `pdf_path` and
`acknowledged_at`, and never touch money. The old `confirm_*` functions are
dropped, since they would apply allocations a second time.

**Rules.**
- **Only the owner, only through the functions.** `create_*` are `SECURITY
  DEFINER` (they now update `rent_periods`, which the owner role can't) and
  start with `if not is_app_owner()`. `INSERT` on `payments`,
  `payment_allocations`, `payment_proofs`, `adjustments` and
  `adjustment_allocations` is revoked from `authenticated`, so nobody can
  add a ledger row that skips the checks or the balance update.
- **Locks before checks.** The functions lock the months (`ORDER BY id FOR
  UPDATE`) before checking what's still owed, so concurrent recordings
  serialize instead of over-filling a month.
- **Messaging is the owner's choice.** The form's "send the tenant a link"
  checkbox (default on) decides whether the tenant is messaged; a confirm
  token is generated either way, so a link can be sent later ("Send link",
  allowed until `acknowledged_at` is set - RLS and the column grant).
- **The receipt exists from the start.** The owner's download renders the
  PDF on demand with the owner's signature (the tenant's box reads "not yet
  signed"); once acknowledged it's the stored tenant-signed copy.
- **Migration.** 0010 confirmed every row still `pending` (applying its
  allocations with the same checks, oldest first, failing the whole
  migration rather than over-allocating) and backfilled `acknowledged_at`
  for rows the tenant had already signed.

**Why.** The owner records money they have actually received; holding it
back until the tenant signed made arrears and "paid" months wrong for as
long as the tenant didn't respond. The signature stays valuable as the
tenant's own record, so it's kept, but optional.

### D21 — Tenant documents are deletable files with a free-text type

**Decision (0011).** `tenant_documents (tenant_id, document_type,
storage_path, file_name, content_type, size_bytes)`: one row per file, kept
in the private bucket under `tenants/<tenant>/documents/` (a CHECK keeps the
path in the tenant's own folder). `document_type` is free text (1-60
characters): the form suggests common types (`TENANT_DOCUMENT_TYPES` in
`src/lib/validation.ts`) but the owner can type any other.

**Rules.**
- **Owner only:** RLS with `is_app_owner()` for select, insert and delete;
  `UPDATE` is revoked (re-upload instead of editing), `anon` gets nothing.
- **Deletable, unlike the ledger.** These aren't money facts, and a replaced
  ID proof or a wrong upload should go; deleting removes the row, then the
  file (best effort). A single-row write needs no SQL function (D5).
- **Same file rules as payment proofs (D19):** photos or PDFs identified by
  their bytes, up to 5 files / 4 MB per upload, photos compressed in the
  browser; viewing redirects to a 5-minute signed URL.

**Why a free-text type and not an enum or lookup table.** The list of
documents people keep varies (shop licences, electricity bills, police
verification); a fixed list would force "Other" and lose the meaning, and a
lookup table is more machinery than suggestions in the form.

### D22 — Receipt numbers: a monthly series taken in the same transaction

**Decision (0012).** Every payment has `receipt_no` = `yyyy/MM/NNN`
(`2026/10/001`): the month it was **recorded** in Asia/Kolkata, then a
sequence shared by all tenants that restarts at 001 each month (and grows to
four digits past 999 rather than wrapping). Adjustments have their own series,
`ADJ/yyyy/MM/NNN`, and their receipt cites the number of the payment they
correct. The receipt PDF prints the number instead of the uuid.

**Rules.**
- **Taken inside `create_payment` / `create_adjustment`** via
  `next_receipt_no(series, at)`, which upserts `receipt_counters (series,
  month, last_no)`. The upsert's row lock serializes concurrent recordings
  in the month, and because it's the same transaction as the insert, a
  rejected write rolls its number back: no gaps.
- **Never changes:** a `prevent_key_change('receipt_no')` trigger (as for
  the place codes, D2), on top of the owner's column grant not covering it.
- **Nobody touches the counter directly:** RLS on with no policies, and
  `next_receipt_no` is executable by no app role - only the definer
  functions call it.
- **Existing rows** were numbered by the migration in `created_at` order
  within each month, and the counters seeded from them.

**Why the recorded month, not the payment date.** Numbers then follow the
order receipts were issued; a backdated payment doesn't take a number in a
month whose receipts are already out. **Why a counter table, not a
sequence.** Sequences don't roll back (gaps on every rejected payment) and
can't restart per month.

### D23 — The owner's name is master data; the signer can be someone else

**Decision (0013).** `owner_profile` is one row keyed like `app_owner`
(`singleton`, referencing it): `first_name`, `last_name`,
`signature_name` and `signature_path`. Receipts print the owner's name as
the landlord and `signature_name` under the signature ("Anil
Sahu, on behalf of Ramesh Sahu"); with no `signature_name` the
owner signs. Before a profile exists, receipts fall back to the account's
name or email.

**Rules.**
- **Keyed to the rent book, not the login:** it describes the owner, so it
  stays if ownership is moved to another account by updating `app_owner`.
- **Owner only:** RLS with `is_app_owner()` for select, insert and update;
  no delete. A single-row write needs no SQL function (D5).
- **Saved signature:** a PNG under `owner/` in the private bucket. A
  payment or adjustment recorded without a drawn signature gets a **copy**
  of it in its own folder, so replacing or removing the saved signature
  never changes a receipt already issued (the old file is then deleted).

**Why a separate table and not columns on `app_owner`.** `app_owner` is
the authorization fact behind every policy and is hidden from the browser
roles; the profile is display data the owner edits, with its own RLS.

### D24 — "Rent paid up to" can be corrected while no payment depends on it

**Decision (0014).** `correct_paid_through(tenant, paid_through)` (owner,
`SECURITY DEFINER`) moves an **active** tenant's `billing_start` (D17) to
`billing_start_for(lease_start, paid_through)`.
- **Earlier:** the missing months are created as owed, and the first rent
  rate's `effective_month` moves back with billing (same amount), so they
  are priced.
- **Later:** the months before the new start are deleted; `BBK09` if any
  payment or adjustment is allocated to one of them.
- Payments already recorded keep their allocations. Moving one to another
  month is not something this does: the ledger is append-only (D4).

**Why.** A wrong "paid up to" when completing a draft either invents
arrears or hides them, and `billing_start` is otherwise fixed once active.
Dropping a month that a payment covers would orphan money, hence the refusal.

### D25 — Audit log: every change to vital data, written by triggers

**Decision (0015).** One append-only table, `audit_log`, holds the history
of everything that changes in place, plus a few app events.

- **Triggers write it.** `audit_row_change()` (`SECURITY DEFINER`) runs
  after insert/update/delete on `tenants`, `tenant_units`,
  `tenant_rent_rates`, `rent_periods` (update of `amount_due`, delete),
  `locations`, `properties`, `units`, `tenant_documents`, `owner_profile`,
  `payments`, `adjustments` and `app_owner`. No path can skip it: the SQL
  functions, the owner's direct writes under RLS, the service role and
  hand-run SQL all go through.
- **A row is a diff.** `changes` is `{column: [old, new]}` for the columns
  that changed; an update that changes nothing writes no row. Bookkeeping
  and secrets are never stored: ids, timestamps, `token_*`, signature and
  PDF paths, `otp_verified_at`, `storage_path`, and on ledger/period rows
  `amount_allocated` / `status` / `confirmed_at` (money movement is
  explained by the payment row itself).
- **Actions are derived** from table + operation, with a few named cases:
  a tenant update that sets `status` is `tenant.moved_out` /
  `tenant.activated`, one that moves `billing_start` is
  `billing_start.corrected`, a tenancy getting an `end_date` is
  `tenancy.ended`, `acknowledged_at` is `payment.acknowledged`. The list is
  `AUDIT_ACTIONS` in `src/lib/types.ts`; labels in `src/lib/domain/audit.ts`
  and, for the stored text, `audit_action_label` in SQL (D27).
- **One change, many rows.** `tx_id` (`txid_current()`) groups what one
  function call did: a move-out, the tenancies it ended and the months it
  dropped share it, and the timeline shows them together. No existing
  function had to change for this.
- **Who.** `actor_id = auth.uid()`; `actor_kind` is `owner`
  (`is_app_owner()`), `tenant` (an acknowledgement), `system` (cron, service
  role, SQL editor) or `visitor` (a failed sign-in).
- **App events** go through `log_event()`, which accepts only
  `message.sent`, `receipt.downloaded`, `auth.sign_in`,
  `auth.sign_in_failed`, `auth.password_changed` and `auth.signed_out`:
  table actions belong to the trigger. The owner logs as themselves; the
  service role names the actor (sign-ins use it because the new session
  isn't on the request yet). The app logs best-effort (`recordEvent` in
  `src/server/services/audit.ts`): a failed audit write never blocks a
  payment, a message or a sign-in. Never logged: message text, OTPs,
  passwords, the email typed into a failed sign-in, or a raw IP (a short
  hash only).
- **Nobody edits history.** RLS lets the owner `SELECT`; `insert`,
  `update`, `delete` and `truncate` are revoked from `authenticated` and
  `service_role`, and a `before update or delete` trigger raises `BBK09`
  even for a role with table rights. No foreign keys, so history outlives
  what it describes. Kept forever (the volume is tiny).
- **Who recorded it, on the row.** `recorded_by uuid default auth.uid()` on
  `payments`, `adjustments`, `tenant_documents`, `tenant_units` and
  `tenant_rent_rates` (the default sees the caller even inside definer
  functions), frozen by `prevent_key_change('recorded_by')`. Existing rows
  were backfilled with the owner.

**Why.** D7/D8 keep *effective-dated* history, but several writes still
overwrite: the tenant's contact details, a rent set twice for the same
month (`on conflict do update`), re-priced and dropped months, master data,
deleted documents, the profile. None recorded when it was entered or by
whom. Per-entity history tables would have meant a copy of every table and
every function; one trigger covers them all. History starts at 0015: older
changes are only what the dated tables already show.

### D26 — Government tenants: rent paid to the owner directly, tracking switchable

**Decision.** `0016_government_tenants.sql` adds two columns to `tenants`:
- **`tenant_kind`**: `individual | business | government`. Existing rows
  were backfilled as `business` when they have a business name, otherwise
  `individual`. A government tenant may have no phone
  (`tenants_active_has_phone`). Messaging already skips a missing phone.
- **`rent_tracked`** (default true): it can be false only for a government
  tenant (`tenants_untracked_is_government`).

An **untracked** tenant is `active` and holds its houses through
`tenant_units` as usual. Its `billing_start` is **null**, which is allowed
only while untracked (`tenants_active_has_billing_start`).
- `ensure_rent_periods` also checks `rent_tracked`, so it has no rent
  months, no dues and nothing in Defaulters.
- Its rent rate is optional: the agreement rent, from the lease month.
- The app hides Record payment. In the totals, its rent counts as billed and
  collected each month without being stored (A11 in
  `docs/design-decisions.md`).

Where `rent_tracked` is set and changed:
- `create_tenant` and `update_tenant` (when completing a draft) set it at
  the start. An untracked draft goes active with just a lease start.
- After that, only these functions change it:
  - **`start_rent_tracking(tenant, rent, paid_through)`** sets
    `billing_start = billing_start_for(lease_start, paid_through or last
    month)` (D17). It writes the rent from then if one is given (otherwise
    the agreement rent must cover that month), then creates the months. From
    then on it's a normal tenant.
  - **`stop_rent_tracking`** undoes that while no payment or adjustment is
    recorded against any month: it deletes the months and clears
    `billing_start`. After that, tracking is one-way.
- `correct_paid_through` refuses an untracked tenant.
- `update_tenant` refuses to change an untracked tenant's kind (`BBK09`).
- The audit trigger names the switch `rent_tracking.started` /
  `rent_tracking.stopped`.

**Why.** Some houses are let to government institutes that pay rent
straight into the owner's bank under their agreement. The owner wants them
in the rent book for occupancy, not as fake arrears. These alternatives were
rejected:
- **Keeping them as drafts** would hide that they are real, current tenants.
- **A fake "paid" payment every month** would invent ledger records.

Tracking is one-way once money is recorded. A pause/resume would leave a gap
in the months, which `ensure_rent_periods` would refill from `billing_start`.
Supporting that would need a billing-end column for an event that hasn't
happened.

### D27 — Audit rows store the text the history shows

**Decision (0017).** `audit_log` has three more columns, written once when
the row is inserted and never changed:
- **`title`**: what happened ("Rent changed", "Link not delivered to tenant");
- **`details`**: the changed values as shown, lines joined with " · "
  ("Monthly rent: ₹6,000.00 → ₹6,500.00");
- **`actor_name`**: the owner's name from `owner_profile` ("Owner" before a
  profile exists), or Tenant / System / Not signed in.

How it's built:
- **A `BEFORE INSERT` trigger** (`audit_log_fill_text`) fills them with
  `audit_describe(action, changes, context)` and `audit_actor_name(kind)`. So
  both writers (`audit_row_change` and `log_event`) get the text without
  changing.
- **The text rules live in SQL:**
  - `audit_action_label`;
  - the column list, with each column's label and format, in
    `audit_describe`;
  - `audit_value` for enum labels and floors;
  - `audit_money`, `audit_date`, `audit_month` and `audit_datetime`.
  They produce exactly what the app's formatters do (en-IN, Asia/Kolkata:
  `₹12,34,567.50`, `5 Sept 2026`, `26 Oct 2026, 6:50 pm IST`).
  `test/schema.test.ts` compares them with `formatMoney`, `formatDateKey`,
  `formatDateTime`, `auditActionLabel` and the label maps in `src/lib/domain/`,
  so the two can't drift silently.
- **Backfill:** 0017 filled the existing rows, with the immutability trigger
  off for that one statement. It used the owner's name as it was then.
- **Reads are plain.** The app shows `title` / `details` / `actor_name` as
  stored; nothing rebuilds the text. `audit_history_page()` (0018, security
  invoker, so RLS applies) is one query over these columns, plus the
  tenant's current name joined from `tenants`, for the Activity page and a
  tenant's Change history (A14 in `docs/design-decisions.md`):
  - search: every word in who / what / tenant / house / details, `%` and
    `_` literal;
  - the grid's text filters, combined with and / or;
  - sort by when / who / what / tenant / house;
  - "Show" (actions) and the From/To days;
  - one page, with the matching and total counts.

**Why.**
- Built on every read, the text couldn't be searched, sorted or paged by
  the database, so the app had to load a tenant's whole history to search it.
- An audit log should show what was true when the change happened. A label
  or a name changed later now leaves old rows as they were written.

**Rejected:** writing the text from the app. Most rows come from table
triggers inside the SQL functions, where the app has no hook, and the log
can't be updated afterwards.

### D28 — Growing tables are built, paged and searched in SQL

**Decision (0019-0021).** The tables whose rows grow every month each have
one `security invoker` SQL function. Each returns
`{rows, total, all, page}` for one page, after "Show", search, the grid's
text filters and sort (A15 in `docs/design-decisions.md`):

| Function | Table | Rows |
|---|---|---|
| `tenant_months_page` (0019) | tenant Months | `rent_periods` with the shown status (`period_display_status`) and month label |
| `tenant_ledger_page` (0020) | tenant Ledger | charges, payments and adjustments in one journal, with the running balance |
| `billing_page` + `billing_totals` (0021) | Billing grid and its stat cards | stored months in the range, plus government paid-direct months (A11), with tower, houses and "Paid by" |

How they're built:
- **Shared helpers (0019):** `grid_check` (refuses unknown sorts, fields,
  operators and page sizes with `BBK00`), `grid_words`, `grid_active_filters`
  and `grid_row_matches`. Each row is passed as `{field: shown text}`, and
  the search and filters run on that text (`like_escape` and
  `audit_text_matches` from 0017 are reused). Also `app_current_month()`,
  `status_label()` and `period_display_status()`.
- **The ledger replaces `buildTenantLedger`** (deleted) with the same rules:
  - "upcoming" charges for this month and later;
  - adjustments dated their Asia/Kolkata confirmation day, a negative
    delta being a debit;
  - the balance skips pending and upcoming rows.

  The journal order is date, type, when recorded, then id. This replaces
  JS's database order for same-day, same-type rows. The balance is a window
  sum over the tenant's whole ledger, worked out before filtering and
  paging, so every page and date filter shows the all-time balance. Only
  the page's payments have their proofs read.
- **Billing ports `getBillingReport` and `billingTotals`** (both removed):
  - **Rows:** every stored month in the range.
  - **Tower and houses:** the tenant's current houses, or the last ones
    after a move-out (`tenant_placement_now`, as `currentTenancies`).
  - **"Paid by":** the confirmed payments allocated to the month, in one
    join. This removes the old one-query-per-earlier-payment fetch and the
    unbounded payments read.
  - **Paid-direct months:** generated as `paidDirectMonths` does. The JS
    stays for the Overview and the Received card, and a schema test checks
    the two agree, including the two-months-ahead limit.
  - **Index:** `rent_periods (period_month)` serves the range.
- **Labels:** the SQL text matches what the app showed (month labels,
  `Payment received (cash)`, statuses). The schema tests pin it, and a
  before/after comparison on the live data matched for Months.

**Why.** These tables gain rows every month. Loading them whole made every
page slower over time, and paging in the browser limited search, sort and
export to what was loaded.

### D29 — Stat cards are aggregates in SQL

**Decision.** A page's figures (totals, counts, yes/no flags) come from one
`stable security invoker` SQL function that returns a `jsonb` object with
just those numbers. Never load the history into JS to add it up.
- **Examples:** `tenant_account_summary(tenant)` (0022) for the tenant page's
  Outstanding, Months overdue, "N of M ended months paid", Move out's amount
  owed and "Stop tracking"; `billing_totals` (0021) for the Billing cards.
- **Same rules as the JS.** Where a pure helper in `src/lib/domain/` still
  computes the same figure elsewhere (`summarizeBalance` for the Overview and
  Defaulters), a schema test checks the SQL and the JS agree on the same
  rows.
- **Months billed ahead:** the service still calls `ensure_rent_periods`
  first, so "not due yet" counts the months created ahead.
- **Security invoker,** so RLS decides what is counted: a non-owner gets
  zeros. A rule that a `security definer` write enforces (stop tracking:
  `has_allocations_from`, not executable by the owner) is spelled out again
  in the aggregate, and the write keeps enforcing it.

**Why.** The tenant page read every rent month, payment and adjustment of
the tenant on each visit to show two cards. That cost grew with the
tenant's age; one aggregate returns one row however long the history is.

---

## 3. Checklists

**Adding a table**
1. Choose the key: a natural code, which then never changes (trigger + format
   CHECK), or a uuid for people and money.
2. Add `created_at` (and `updated_at` with the `set_updated_at()` trigger if
   it's editable master data).
3. `enable row level security`, then add policies with `is_app_owner()`.
   `revoke all … from anon`. Revoke `delete`, plus `insert`/`update` if
   writes must go through a function.
4. Foreign keys `on update restrict on delete restrict`, with an index on
   each one you query by.
5. Write `COMMENT ON TABLE`, add the table to `src/lib/types.ts`, and add
   schema tests: the owner can, a non-owner sees nothing.
6. If it holds data worth a history (people, money, places, files), attach
   `audit_row_change('<entity>')` after insert/update/delete (D25), add any
   new action to `AUDIT_ACTIONS` with a label in `src/lib/domain/audit.ts`
   and the same label in `audit_action_label()`, add its columns (label and
   format) to the list in `audit_describe()` (D27, both by `create or replace`
   in a new migration), and skip secrets and paths in the trigger.

**Adding a write that touches money or several rows**
1. Write it as one plpgsql function. Check its invariants, raising `BBK00`,
   `BBK04` or `BBK09`.
2. If it runs as the owner: `security invoker` when RLS already allows the
   writes; otherwise `security definer` + `set search_path = public` +
   `if not is_app_owner()` first.
3. Revoke and re-grant `EXECUTE` explicitly.
4. Add it to `Functions` in `types.ts` and call it via `db.rpc()` wrapped in
   `mustWrite` in the adapter.
5. Add schema tests for the happy path, each rejection, and that a non-owner
   gets `BBK04` or `42501`.
6. Nothing to add for the audit log: the tables' triggers record what the
   function changed, grouped by `tx_id` (D25). Add an audit schema test if
   the change should read as a new kind of action.

**Adding figures for a page (totals, counts, flags)**
1. One `stable security invoker` SQL function returning `jsonb` with just the
   figures (D29). Use `app_current_month()` for "ended" vs "not due yet".
2. Revoke from `public, anon, authenticated`, then grant to `authenticated`,
   also on each helper it calls.
3. Add it to `Functions` with a `…Db` return type in `types.ts`, and call it
   via `db.rpc()` wrapped in `must` in the adapter.
4. Add schema tests: the figures on known rows, the empty case, a non-owner
   gets zeros, `anon` gets `42501`, and agreement with any JS helper that
   computes the same figure.

**Changing history** (`tenant_units`, `tenant_rent_rates`, the ledger)
- Don't. Add a row or close an open one through the existing functions; if a
  new kind of change is needed, add a function that only appends or closes.

---

## 4. Alternatives considered and rejected

| Alternative | Why not |
|---|---|
| Keep `owner_id` on every row | One owner; it added composite FKs and filters everywhere (see D1). |
| Drop `owner_id` and allow any `authenticated` user | Any extra Supabase login would see all tenants and money. |
| uuid primary keys for places + a unique code column | Extra joins and indirection for codes that are already stable and human-facing (D2). |
| One tenant row per house | Rent is collected per tenant; one tenant with 4 shops would get 4 ledgers and receipts. |
| Overwrite `tenants.monthly_rent_amount` on change | Loses history and silently re-prices paid months (D8). |
| A separate lease/agreement entity now | More correct for renewals, but a large ledger refactor; `tenant_units` + `tenant_rent_rates` cover turnover and rent changes. Revisit if leases with terms/deposits are needed. |
| Redis for rate limiting | An extra service for a small app; the Postgres counter is enough (D12). |
