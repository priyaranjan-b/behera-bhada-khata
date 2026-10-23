---
name: add-api-endpoint
description: Add or change a data operation in Behera Bhada Khata - a new read for a page, a new form submit/mutation, a new field in an API response, or anything that touches the database. Walks the layers (contract -> port/adapter -> service -> route.ts -> API client -> page) so Supabase stays behind src/server and the API tree keeps mirroring the page tree. Use before writing any data-fetching or database code in this repo.
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
     implementation must scope it to that owner.
   - `SystemRepositories`: unscoped. Use it only when the caller is authorized
     some other way: the confirm token, cron, or rent-period upkeep.
2. Implement the method in `src/server/adapters/supabase/db.ts`:
   - Owner repos add `.eq("owner_id", ownerId)` where the column exists, on
     top of RLS.
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
- Don't import `next/*` or `@supabase/*`; ESLint blocks both.
- Keep pure calculations in `src/lib/*` (`allocation.ts`, `reports.ts`,
  `tenantLedger.ts`) when the browser needs them too.

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
`fetch('/api/…')`. Check the page too. Expect a 404 for an id the owner
doesn't own, and a 400 with a readable `error` for invalid input.

## Don'ts

- Don't call `fetch` directly in a component. Go through `api`.
- Don't have a Server Component fetch `/api/...`. Use `serverApi`.
- Don't edit or delete ledger rows (`payments`, `adjustments`, allocations).
  Corrections are new `adjustments`, and only the confirm flow flips
  `pending → confirmed`.
- Don't let a create service take an `owner_id` from input. The adapter sets
  it from `ctx`.
