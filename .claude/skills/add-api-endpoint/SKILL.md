---
name: add-api-endpoint
description: Add or change a data operation in Behera Bhada Khata - a new read for a page, a new form submit/mutation, a new field in an API response, or anything that touches the database (tables, columns, migrations, RLS policies, SQL functions, seed data). Starts from docs/database-design.md, then walks the layers (migration -> types -> contract -> port/adapter -> service -> route.ts -> API client -> page) so Supabase stays behind src/server and the API tree keeps mirroring the page tree. Use before writing any data-fetching or database code in this repo.
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

- A page's data is a **GET at the page's own path under `/api`**:
  `app/dashboard/tenants/[tenantId]/payments/new/page.tsx` →
  `app/api/dashboard/tenants/[tenantId]/payments/new/route.ts`.
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
  `reports.ts`, `tenantLedger.ts`) when the browser needs them too, with a
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

// POST from /dashboard/tenants/[tenantId]/payments/new
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
- [ ] Service validates every input and id; limits and enums are shared
      constants; no duplicated helper from another service.
- [ ] A test in `test/services/` (and `test/schema.test.ts` for SQL).
- Don't read-modify-write a balance in JS; let SQL do `x = x + delta`.
- Don't reintroduce `owner_id` columns or owner filters. Ownership is the single
  `app_owner` row (see `docs/database-design.md`, D1).
