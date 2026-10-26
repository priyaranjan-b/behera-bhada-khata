---
name: add-api-endpoint
description: Add or change a data operation in Behera Bhada Khata - a new read for a page, a new form submit/mutation, a new field in an API response, or anything that touches the database (tables, columns, migrations, RLS policies, SQL functions, seed data). Starts from docs/database-design.md, then walks the layers (migration -> types -> contract -> port/adapter -> service -> route.ts -> API client -> page) so Supabase stays behind src/server and the API tree keeps mirroring the page tree. Includes the recipe for lists that grow every month (history, payments, rent months, billing), which are paged, sorted and searched in SQL. Use before writing any data-fetching or database code in this repo.
---

# Add an API endpoint

The UI never imports a database SDK or `@/server/*`. Data flows:

```
page / component ──serverApi (in-process) or api (fetch)──▶ src/app/api/**/route.ts
  ──▶ src/server/services/<domain>.ts ──▶ ports (src/server/ports.ts)
  ──▶ src/server/infra ──▶ src/server/adapters/supabase/*
```

Read `CLAUDE.md` → "Data access — layers" first. Then go through the steps
below in order and skip any that don't apply.

## 0. Database changes: read `docs/database-design.md` first

If the change touches the database at all (a new table, column, constraint,
index, RLS policy, SQL function, seed row, or a different query shape), read
`docs/database-design.md` before writing anything, and follow its
**Checklists** section. The rules you must not break:

- **Single owner.** There is no `owner_id` anywhere. Every policy and
  owner-facing function checks `is_app_owner()`.
- **Codes are permanent primary keys** (`AC`, `AC-T1`, `AC-T1-G01`).
  People and money use uuids.
- **History is append-only.** The ledger, `tenant_units` and
  `tenant_rent_rates` change only by appending, or by closing an open row
  through the SQL functions.
- **Every money-moving or multi-row write is one SQL function** with
  `BBK00`/`BBK04`/`BBK09` errors and an explicit revoke + grant.
- **Never edit an applied migration;** add the next numbered file. Cover it
  in `test/schema.test.ts` and mirror it in `src/lib/types.ts`.

If your change adds a new design decision, or changes one, update
`docs/database-design.md` in the same change.

## 1. Pick the path (mirror the page tree)

- A page's reads are **GETs under the page's own path in `/api`**:
  `app/(app)/tenants/[tenantId]/payments/new/page.tsx` →
  `app/api/dashboard/tenants/[tenantId]/payments/new/route.ts`.
- **Split them logically; never return everything the page needs in one
  big response.** One GET, service function and contract per logical
  section of the page, e.g. the Overview's `…/overview/month`,
  `…/overview/trend`, `…/overview/houses` (A12 in
  `docs/design-decisions.md`).
  - **Where to cut:** group data that changes together, comes from the same
    source and costs the same to load. A different query, a different
    refresh trigger (the selected month vs today) or a much slower read is
    a different endpoint.
  - **Reuse before adding.** If an endpoint already returns what a
    component needs, call it rather than copying its data into a new
    response. The Overview's top-defaulters card reads
    `/api/dashboard/defaulters`, the Defaulters page's own endpoint.
  - **Contracts are per section and view-ready.** A component takes the
    slice it renders, never a whole page response, so it can move to
    another page with its call.
  - **No repeated queries.** Reads that several endpoints need (tenant
    list, rent months, placements, the `ensure_rent_periods` top-up) go
    through the `cache()` loaders in `src/server/services/loaders.ts`.
    Within a page render they run once, however many calls use them.
  - **Don't over-split.** Aim for about 6-7 calls per page, not one per
    widget. A single form's data (`…/payments/new`) stays one GET.
  - **In the page:** start every call before awaiting any, and wrap each
    section in `AsyncSection` (see the `build-dashboard-page` skill).
- A write is a **POST to the collection it creates in**:
  `…/tenants/[tenantId]/payments`, `…/payments/[paymentId]/adjustments`.
- Actions on a record are sub-paths: `…/payments/[paymentId]/resend`, `…/receipt`.
- Tenant-facing routes live under `/api/confirm/[token]`. Owner routes live under `/api/dashboard`.

Add the path to `src/lib/api-client/paths.ts` (`apiPaths`).

## 2. Contract

- Add the request/response types to `src/lib/contracts.ts`. They must be
  client-safe: no row types that carry `token_hash`, signature paths, and so on.
- Return view-ready shapes in camelCase with money as `number`. Leave
  locale formatting (`toLocaleDateString`, `formatMoney`) to the page.
- Input types derive from the zod schema in `src/lib/validation.ts`:
  `Omit<z.infer<typeof schema>, "<pathParam>">`.

## 3. Data access (only if a new query is needed)

1. Add the method to the right interface in `src/server/ports.ts`:
   - `OwnerRepositories`: everything the signed-in owner does. The
     implementation must refuse anyone but the single app owner (the
     Supabase adapter relies on RLS / `is_app_owner()`).
   - `SystemRepositories`: unscoped. Use it only when the caller is authorized
     some other way: the confirm token, cron, or rent-period upkeep.
2. Implement the method in `src/server/adapters/supabase/db.ts`:
   - There is no `owner_id` to filter on; RLS already limits every query
     to the app owner. Don't add owner filters.
   - Guard `.in()` against empty arrays.
   - Use `must()` for reads (→ 500) and `mustWrite()` for inserts and updates
     (→ 400 with the DB message).
3. Never import an adapter from a service. Import `ownerDb` / `systemDb` /
   `auth` / `storage` from `@/server/infra`.

## 3a. A list that grows: page it in SQL (A15)

**Which lists:** a list whose rows grow every month (history, payments,
adjustments, rent months, billing rows) is served one page at a time. The
database pages, sorts, searches and filters it; JS never loads it all to
slice. A list fixed by master data (tenants, houses, towers, sites) returns
every row and the grid does the rest in the browser. The UI half is in
`build-dashboard-page`.

**Worked examples:** Activity / a tenant's Change history (below), and the
tenant Months, Ledger and Billing (D28: `tenant_months_page`,
`tenant_ledger_page`, `billing_page`, built on the 0019 grid helpers
`grid_check` / `grid_row_matches`, which new tables should reuse). Follow
it layer by layer:

| Layer | Example |
|---|---|
| Query + limits | `GridQueryParams` (`src/lib/domain/gridQuery.ts`); `gridQuerySchema(sortFields, filterFields, defaults)` + extra filters (`auditTableQuerySchema`); `GRID_LIMITS` (page sizes 10/25/50/100, search length, max filters) in `src/lib/validation.ts` |
| Contract | `AuditTableQuery extends GridQueryParams`; response `{ entries, total, all, page }` (`AuditTablePage`): `total` matching, `all` before filters, `page` as clamped |
| SQL | `audit_history_page()` in `0018_audit_history_page.sql` |
| Port / adapter | `audit.historyPage(filter)` → `db.rpc(…)` in `must()` |
| Service | `historyPage()` in `src/server/services/audit.ts`: `parseInput`, a const map of table field → column (`HISTORY_COLUMNS`), one repository call |
| Route | unchanged one-liner; query params arrive as strings (`readQuery`) |

**The SQL function** (copy `audit_history_page`):
- **Security invoker**, so RLS (`is_app_owner()`) decides what the caller
  sees. Revoke from public/anon/authenticated, then grant execute to
  `authenticated` on it *and on every helper it calls*.
- **Validate first:** sort, direction, logic, page ≥ 0, page size in range,
  and every filter's `field` and `operator` against fixed lists. Anything
  else raises `BBK00`. Never build SQL from a field name: sort with a
  `CASE` whitelist in `ORDER BY`, with `id desc` as the tie-break.
- **Search:** every word must appear in some searchable column, via
  `ilike '%' || like_escape(w) || '%'` (`like_escape`, 0017, makes `%` and
  `_` literal). **Filters:** `audit_text_matches(text, operator, value)`
  (0017) for the grid's text operators, combined with and/or. Drop filters
  without a value first, or an empty one matches everything under "or".
- **Counts and paging:** count `all` and `total`, clamp the page to the
  last one, and return `jsonb_build_object('rows', …, 'total', …, 'all', …, 'page', …)`.
- **Searchable text must be in columns.** Search and sort only make sense
  on what the user sees. If a shown value is built in JS (a label, a
  formatted amount), either store the display text with the row at write
  time (D27: `audit_log.title`/`details`, filled by a `BEFORE INSERT`
  trigger) or leave that column out of search and sort. Never search raw
  enum values the user never sees.
- **Indexes:** the base filter (e.g. `tenant_id`) needs an index ordered
  like the default sort (`(tenant_id, id desc)`).
- **Schema tests:**
  - paging and clamping;
  - each operator with and/or;
  - `%` typed literally;
  - each sort either way;
  - every extra filter;
  - a bad sort/filter → `BBK00`;
  - a non-owner → no rows;
  - anon → `42501`.

## 4. Service

In `src/server/services/<domain>.ts` (start the file with `import "server-only"`):

- Signature: `(ctx: OwnerContext, ...pathParams, body?: unknown)`. Public
  flows take no `ctx`.
- Validate untrusted input inside the service:
  `parseInput(schema, withParams(body, { tenantId }))`. Path params win over
  body fields.
- Fail with `ApiError(status, message)` or `notFound("Tenant")` from
  `./context`. Don't return error objects.
- Don't import `next/*`, `@supabase/*` or `twilio`; ESLint blocks them. Send
  messages through `messaging` / `notifyTenant`, read config via `env()`.
- Keep pure calculations in `src/lib/domain/*` (`allocation.ts`,
  `reports.ts`, `billing.ts`) when the browser needs them too, with a
  colocated `*.test.ts`. Dates come from `src/lib/dates.ts` (app time zone).
- A write that touches more than one row, or moves money, is a Postgres
  function in a new migration (see `0004_ledger_integrity.sql`): one
  transaction, invariants checked in SQL, user-facing errors raised as
  `BBK00`/`BBK04`/`BBK09`, EXECUTE revoked from `public, anon,
  authenticated` and re-granted narrowly. Add it to `Functions` in
  `src/lib/types.ts`, call it with `db.rpc(...)` wrapped in `mustWrite`, and
  cover it in `test/schema.test.ts`.
- A public endpoint that sends SMS/email or is worth brute-forcing calls
  `enforceRateLimits([...])`; its route passes `requestMeta(request)`.
- Validate path ids first with `requireId` / `requireTenant` (`./context`):
  a malformed uuid is a 404 before any DB call. Reuse the helpers in
  `./context` rather than repeating `get` + `notFound` per function.
- No magic numbers: signed-URL lifetimes and rate limits are named
  constants in `./context`; input limits are exported from `validation.ts`
  and the schema and the service check read the same constant.
- Enums (`mode`, `status`, `recordType`, ...) come from the `as const`
  arrays in `src/lib/types.ts`; never write `z.enum([...])` literals.
- Payment and adjustment flows are twins: change both through one helper
  keyed by record kind instead of copy-editing two functions.
- Derive facts from the database, not the request: e.g. resend reads the
  tenant and amount from the record, and never trusts ids or amounts the
  client could change.
- Places are keyed by permanent codes (`AC`, `AC-T1`, `AC-T1-G01`): route
  params are `[propertyCode]`, parsed with `propertyCodeSchema` (malformed =
  404). Never add an `UPDATE` of a code column - the trigger rejects it.
- A tenant's houses and rent are history: read them through
  `src/server/services/placements.ts` (`loadPlacements`, `placementOf`,
  `availableUnits`), and change them only via `create_tenant` /
  `update_tenant` / `move_out_tenant` - never by writing `tenant_units` or
  `tenant_rent_rates` directly.

## 5. Route handler

Each handler is one line per method, using `src/server/http.ts`:

```ts
import { ownerRoute, readJson } from "@/server/http";
import { createPayment } from "@/server/services/payments";

type Params = { tenantId: string };

// POST from /tenants/[tenantId]/payments/new
export const POST = ownerRoute<Params>(async (ctx, request, { tenantId }) =>
  createPayment(ctx, tenantId, await readJson(request))
);
```

- **`ownerRoute`:** owner JSON endpoints (401 without a session).
- **`publicRoute`:** confirm flow, auth, cron.
- **`ownerLinkRoute` + `redirectTo(url)`:** URLs opened directly in the
  browser, such as receipt downloads (no session → `/login`).
- Return the value (it becomes JSON; `undefined` → `{ ok: true }`) or a `Response`.

## 6. API client

- Declare the method in `src/lib/api-client/types.ts`:
  - `ApiQueries` for reads that pages need.
  - `ApiCommands` for writes.
- Implement it in `src/lib/api-client/http.ts`.
- For a query, also wire it in `inProcessApi` in
  `src/lib/api-client/server.ts`, calling the same service as the route.
  TypeScript fails until both transports match.

## 7. Use it

- **Server Component:** `const data = await serverApi.dashboard.tenants.detail(id)`.
  Don't handle 401 or 404 yourself; `serverApi` redirects to `/login` and
  calls `notFound()`.
- **Client Component:** `await api.dashboard.tenants.createPayment(id, input)`
  inside a `try`. Show errors with
  `setError(errorMessage(err, "Couldn't save that payment."))`, then
  `router.push(...)` and `router.refresh()`.
- **Links to API URLs** (downloads):
  `href={apiHref(apiPaths.dashboard.payments.receipt(id))}`.

## 8. Verify

```bash
npx tsc --noEmit -p .   # ignore stale .next/types errors for deleted routes
npm run lint            # catches layering violations
```

With the dev server on :3000, check the route in a signed-in browser with
`fetch('/api/…')`. Check the page too. Expect a 404 for an id that doesn't
exist, a 403 when signed in with an account that isn't the owner, and a 400
with a readable `error` for invalid input.

## Don'ts

- Don't call `fetch` directly in a component. Go through `api`.
- Don't have a Server Component fetch `/api/...`. Use `serverApi`.
- Don't edit or delete ledger rows (`payments`, `adjustments`, allocations).
  Corrections are new `adjustments`. Records are `confirmed` when written
  (0010); the tenant's confirm flow only sets `acknowledged_at` via
  `acknowledge_payment` / `acknowledge_adjustment`.
- Don't put parsing, casts or redirects in `route.ts`; the service takes the
  raw body and parses it.
- Don't leave a doc comment detached from its function when inserting code
  between them.

## Before you finish

- [ ] Route is one line per method; path in `paths.ts`, method in
      `ApiQueries`/`ApiCommands`, `http.ts` and (for reads) `server.ts`.
- [ ] Reads are split by logical section, not one page-wide response; an
      existing endpoint was reused where it already had the data; shared
      reads go through `src/server/services/loaders.ts`.
- [ ] Service validates every input and id; limits and enums are shared
      constants; no duplicated helper from another service.
- [ ] A test in `test/services/` (and `test/schema.test.ts` for SQL).
- [ ] A list that grows every month is paged, sorted and searched in SQL
      (3a); a master-data list returns every row.
- Don't read-modify-write a balance in JS; let SQL do `x = x + delta`.
- Don't reintroduce `owner_id` columns or owner filters. Ownership is the single
  `app_owner` row (see `docs/database-design.md`, D1).
