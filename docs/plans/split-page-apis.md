# Split page APIs into logical sections

**Status: done (Oct 2026).** Task 1 `22bcfb7`, task 2 `9c38822`, task 4
(Billing) `c3ed888`, task 3 (tower) `b3579c0`. One deviation from the plan:
the tenant and tower pages have no `loading.tsx`, because one in their
folder would also show while their child pages (edit, forms, the payment
modal) load.

Follow-up to the Overview rework (A12, `22114f5`), applying the rule in
`CLAUDE.md` → "Split a page's data into logical reads" and the
`add-api-endpoint` skill to the remaining pages. Each task below is one PR:
endpoints + service + loaders, a section per call under `AsyncSection`, the
skeleton map shared with `loading.tsx`, tests, a browser check.

## Scan (every `page.tsx`, Oct 2026)

| Page | Today | Verdict |
|---|---|---|
| `/dashboard` (Overview) | 7 calls | Done (A12) |
| `/dashboard/tenants/[tenantId]` | 1 call: profile + balance + months + ledger + flags | **Split** (task 2) |
| `/dashboard/properties/[propertyCode]` | 1 call: header + houses + tenants | **Split** (task 3) |
| `/dashboard/billing` | 1 call: rows + totals + received + paid-direct state | **Split** (task 4) |
| `/dashboard/defaulters` | 1 call | Keep: groups and totals are derived from the same rows |
| `/dashboard/properties` | 1 call | Keep: one list of sites and towers |
| `/dashboard/houses`, `/dashboard/tenants`, `/dashboard/activity` | 1 call each | Keep: one grid or feed each |
| `/dashboard/profile`, every `new` / `edit` / `adjust` / `payments/new` form | 1 call each | Keep: a single form's data stays one GET |
| `/login`, `/confirm/[token]`, `/` | 1 call each | Keep: public, single-purpose |
| `dashboard/layout.tsx` | session + profile, together | Done (shared session check) |

## Tasks

### 1. Shared paid-direct state endpoint
- **What:** move `/api/dashboard/overview/paid-direct` to
  `/api/dashboard/paid-direct` (`serverApi.dashboard.paidDirect()`). It
  isn't Overview-specific, and Billing needs the same switch.
- **Overview:** the header switch calls the new path.
- **Billing:** drops `paidDirect` from `BillingReport` and uses the
  endpoint (done as part of task 4).
- **Size:** small. Do it first, since task 4 depends on it.

### 2. Tenant page (`/dashboard/tenants/[tenantId]`)
Today `getTenantDetail` waits for the tenant lookup, then the
`ensure_rent_periods` write, then periods, payments, adjustments and
placements, then proofs. That is four steps before anything renders,
including the header and the Details card, which need none of the money
data.

| Call | Path | Feeds | Reads |
|---|---|---|---|
| Profile | `GET …/tenants/[id]` (reshaped) | header, status/tags, Details, House history, Rent history | tenant + placements (no rent months) |
| Account | `GET …/tenants/[id]/account` | Outstanding / Months-behind stat cards, Months grid, `canStopRentTracking` | top-up + rent months, payment/adjustment counts |
| Ledger | `GET …/tenants/[id]/ledger` | Ledger table (payments, adjustments, proofs), `tenantMessaging` | rent months + payments + adjustments + proofs |
| History | existing (`TenantChangeHistory`) | Change history | already streamed |

- **Loaders:** `tenantById(id)`, `tenantPeriods(id)` (after the top-up),
  `tenantPayments(id)`, `tenantAdjustments(id)` in `loaders.ts`. Account and
  Ledger then share the rent months and payments.
- **Header actions that need money data:** `MoveOutButton` (outstanding in
  its confirm text) and the "Stop tracking" button (`canStopRentTracking`)
  go in their own `silent` `AsyncSection` on the account promise. The rest
  of the header renders at once.
- **Reuse:** the Months grid and the Ledger table each take one section's
  contract, so another page (e.g. the payment modal) can show them with
  their own call.
- **Size:** large: the biggest page (284 lines). Split `page.tsx` into
  `sections/` as on the Overview.

### 3. Tower page (`/dashboard/properties/[propertyCode]`)

| Call | Path | Feeds |
|---|---|---|
| Header | `GET …/properties/[code]` (reshaped to the `PropertyHeader`) | title, actions |
| Houses | `GET …/properties/[code]/units` (this path already POSTs; add GET) | Houses grid (`UnitRow[]`) |
| Tenants | `GET …/properties/[code]/tenants` | Tenants grid |

- **Reuse:** the houses rows come from the same builder as `/dashboard/houses`
  (`listHouses`), filtered to the tower, not a second copy.
- **Size:** medium.

### 4. Billing (`/dashboard/billing`)

| Call | Path | Feeds |
|---|---|---|
| Months | `GET …/billing?from&to&paidDirect` (`rows` + `totals`) | Billed / Collected / Balance cards, Billing grid |
| Received | `GET …/billing/received?from&to&paidDirect` | Received card (cash dated in the range: a different query) |
| Paid-direct switch | `GET /api/dashboard/paid-direct` (task 1) | header switch |

- **Why not split the totals from the rows:** they are computed from the
  same rows, so splitting them would mean a second identical query.
- **Size:** medium.

## Order
1. Task 1 (small; unblocks 4).
2. Task 2 (largest gain: the most-used page after the Overview).
3. Task 4.
4. Task 3.

## Per-task checklist
- [ ] Endpoints split by data source, cost or trigger; existing ones reused
- [ ] Shared reads through `src/server/services/loaders.ts`
- [ ] `sections/` + skeleton map shared by `page.tsx` and `loading.tsx`
- [ ] Boundaries keyed by their inputs; header actions that need data in a `silent` section
- [ ] `test/services/` cases per endpoint; `npx next typegen` after moving a route
- [ ] Browser: streams progressively, no error cards, no console errors, 375px
- [ ] Update A12 / `CLAUDE.md` if the pattern changes
