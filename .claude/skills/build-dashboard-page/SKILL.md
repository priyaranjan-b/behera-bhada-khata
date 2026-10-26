---
name: build-dashboard-page
description: Build or restyle a page or UI component in Behera Bhada Khata (Next.js 16 App Router + MUI v9 Dashboard template theme). Covers where the page file goes, how it gets data (serverApi / api), breadcrumbs, the shared UI kit, client- vs server-side tables (rows that grow every month - history, payments, rent months, billing - page, sort and search in the database; master data like tenants and houses stays client-side), the "pages are layout-only" styling rules incl. MUI v9 gotchas, and the phone layout (header buttons, tabs as a select, the one-row table toolbar and filter panels). Use when adding a screen under src/app, a form, a data grid or table, or changing visuals.
---

# Build a dashboard page

Read `CLAUDE.md` → "UI & styling" and "Data access — layers". If the page
needs new data, run the `add-api-endpoint` skill first.

## File layout

- **Page:** `src/app/(app)/<route>/page.tsx` is an async Server Component.
- **Interactive parts:** forms, grids with state and buttons that mutate go
  in a sibling `"use client"` file, for example `PaymentForm.tsx` or
  `TenantLedgerTable.tsx`.
- **Data:** the matching GET lives at `src/app/api/dashboard/<route>/route.ts`.
- **Breadcrumbs:** add one line to `ROUTE_LABELS` in
  `src/components/shell/AppBreadcrumbs.tsx`. The layout renders breadcrumbs
  from the URL, so pages never pass crumbs.
- **Nav tab:** a top-level section also needs a `NAV_ITEMS` entry in
  `src/components/shell/nav.tsx`, plus a case in
  `tabForPath` in `DashboardShell.tsx`.
- **Menu shortcut:** a "start this form from anywhere" page (Add tenant,
  Add house) goes in `QUICK_ADD_ITEMS` in the same file, with an exact-path
  case in `tabForPath` placed before the section checks.

## Page skeleton

```tsx
import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";

export default async function ThingPage({ params }: { params: Promise<{ thingId: string }> }) {
  const { thingId } = await params;              // Next 16: params/searchParams are Promises
  const thing = await serverApi.dashboard.things.detail(thingId); // 401/404 handled for you

  return (
    <Stack spacing={2}>
      <PageHeader title={thing.name} subtitle="…" action={/* buttons */} />
      {/* SectionCard / DashboardCardPanel / grids */}
    </Stack>
  );
}
```

- Use flash messages via query params (`?paymentCreated=1`), rendered with
  `FlashAlert` (`@/components/ui/FlashAlert`) under the header - it removes
  the param after showing, so a reload doesn't repeat it.
- Format months with `formatMonth` and default dates with `todayKey` from
  `@/lib/dates` (app time zone, same text on server and browser).
- A new route segment with its own data gets `loading.tsx`: a
  `PageSkeleton` holding one skeleton per card the page renders
  (`PageHeaderSkeleton`, `StatCardSkeleton`, `ChartCardSkeleton`,
  `PanelSkeleton` from `@/components/ui/Skeletons`), not a page-wide spinner,
  and, if it can fail independently, `error.tsx` (`EmptyState` + `retry`).
- **A page of independent cards (a dashboard): stream it in sections (A12),**
  as on the Overview (`src/app/(app)/(overview)/`).
  - **Parts of a section:**
    - a data call: a service function and a GET, shaped for the section;
    - an async component in `sections/` taking promises;
    - a slot in a `*Layout.tsx`, and its placeholder in a single
      slot → skeleton map (`OVERVIEW_SKELETONS`) that `page.tsx` uses as
      fallbacks and `loading.tsx` spreads into the layout. A placeholder is
      a kit skeleton with a size prop (`DetailCardSkeleton rows={5}`),
      never a new kit skeleton per card. A section that renders several
      cells exports its skeleton from its own file, composed of kit
      skeletons (`AccountStatsSkeleton` next to `AccountStats`), so the page
      and `loading.tsx` share it;
    - an `AsyncSection` boundary (`@/components/ui/AsyncSection`) with
      `title` and `fallback`, keyed by the params its data depends on.
  - **In `page.tsx`:** start every call before awaiting anything, and never
    `await` one call before starting the next.
    - **Exception: a record page.** A detail page may `await` its one small
      header call first: it carries the 404 and decides which sections exist
      (e.g. no money calls for a Govt tenant paying direct). Then it starts the
      rest. Examples: the tenant page and the tower page.
    - **Header buttons that need data** go in a `silent` `AsyncSection` with
      `fallback={null}`, so the rest of the header doesn't wait. Examples:
      Move out (owed amount) and Stop tracking.
  - **`loading.tsx`:** it also covers every child page, so a segment with
    children puts its page and `loading.tsx` in a route group:
    `tenants/[tenantId]/(profile)/`, `properties/(list)/`. Edit and the
    payment modal then never show the tenant page's skeleton.
- **A record page with several tables: tabs by data source (A16),** as on
  the tenant page (`src/app/(app)/tenants/[tenantId]/(profile)/`). The
  header, alerts and the figures most visits need stay above `PageTabs`
  (`@/components/ui/PageTabs`); each table is its own tab. Server-paged
  tables in a tab take no `initial`: `useServerGrid({ empty, … })` loads
  the first page when the tab first opens, and `DataTable`'s skeleton rows
  are its loading state, so there is no `AsyncSection` or fallback around it.
  Link to a tab with `routes.….detail(id, { tab: "ledger" })`.
  - **Shared reads:** reads several sections need go through the `cache()`
    loaders in `src/server/services/loaders.ts` (add one there if missing),
    never repeated `db.*` calls. Inside a section, start every read in one
    `Promise.all`; only rent-month reads wait for `billedTenants()`.
  - **Adding a section:** do it only for a different data source, cost or
    refresh trigger. Otherwise extend an existing section. Keep it to about
    6 calls per page.
- Client mutations follow `try { await api.… ; router.push(…); router.refresh(); }`,
  with `catch` calling `setError(errorMessage(err, "…"))` and passing it to
  `FormActions error={…}`.

## Styling rules (pages under `src/app/**`)

- **Layout only:** Stack and Grid props, `alignItems`, `minWidth: 0` and
  `maxWidth`.
  - No colour, typography, border, radius or shadow `sx`.
  - No `@/theme` imports.
  - No hex values.
- **Text colour:** use the prop `color="textSecondary"`, `"textPrimary"` or
  `"textDisabled"`. MUI v9 silently ignores the dotted `color="text.secondary"`
  form on Typography and Link. Dotted keys still work inside `sx`.
- **`MuiLink`:** the template pins links to `text.primary`. A secondary link
  needs `sx={{ color: "text.secondary" }}` in a kit component, not on a page.
- **Colours in JS:** never read `theme.palette.*`. Use `sx` palette keys or
  `(theme.vars || theme).palette…`. The theme is CSS variables with light and
  dark schemes.
- **Light-only styles:** `theme.applyStyles("light", {...})`. Put a
  specificity hack (`&&`) *outside* `applyStyles`, never inside it.
- **Customising MUI = a reusable component.** If an MUI component needs
  anything beyond its plain props (shadow, shape, loading, extra slots…),
  wrap it once in `src/components/ui/` (or add a theme variant in
  `src/theme/customizations/app.ts` if it's purely visual) and use the
  wrapper everywhere, so screens stay consistent. Check the kit first;
  extend a wrapper with a prop rather than forking it.
- **Anything needed twice:** a component in `src/components/ui/` or a theme
  override in `src/theme/customizations/app.ts`. Light-mode surface tokens
  are in `src/theme/appTokens.ts`. Leave the copied template files in
  `src/theme/` close to upstream.

## Kit to reach for first

- **Page structure:** `PageHeader` and `DashboardCardPanel` from
  `@/components/ui/DataDisplay`, plus `EmptyState`; loading skeletons from
  `@/components/ui/Skeletons` (`PanelSkeleton` matches a `DataTable`).
- **Forms:** `SectionCard`, `FormActions`, `SignatureField`, `AmountRow`,
  `SummaryLine`.
- **Detail rows:** `DetailList`/`DetailRow`, `BadgeRow`, `ActionStack`,
  `IconTile`, `InsetBox`, `GridCell`, `UnitCell`, `DropzoneCard`.
- **Badges:** `StatusBadge` and `TagPill` from `@/components/ui/DataDisplay`,
  `StatusChip` from `@/components/domain/StatusChip`.
- **Tables:** `DataTable` plus `moneyColumn` (`@/components/ui/DataTable`).
  It brings its own card and one-row toolbar, so don't wrap it in
  `DashboardCardPanel`. Pass `title`, `filters` (status selects, with
  `totalCount` + `defaultValue`), `search`, `emptyState` and `rowDensity`.
  Page size defaults to 10. Columns live in a small client `*Grid.tsx` next
  to the page. Row types come from `src/lib/contracts.ts`. Decide first
  whether it pages in the browser or on the server (next section).

## Client-side or server-side table? (A15)

Ask one question: **does the row count grow with time, or is it fixed by
the master data?**

- **Fixed by master data → client-side** (the default `DataTable`): the
  service returns every row, and the grid pages, sorts, searches, filters
  and exports in the browser. Use this for one row per tenant, house,
  tower or site: Tenants, a tower's tenants, Houses (`UnitsGrid`), the
  Overview tenant status grid, Defaulters (one row per tenant), Properties,
  and bulk upload. These stay in the hundreds however long the book is
  kept.
- **Grows every month → server-side** (`paginationMode="server"`): anything
  that gains rows as months are billed, payments recorded or changes made.
  That covers history (`audit_log`), payments and adjustments, rent months
  (`rent_periods`), and anything that multiplies tenants × months. The
  browser holds one page; the database pages, sorts, searches and filters.
  - Server-side today: **Activity** and a tenant's **Change history**
    (`AuditHistoryTable`), the tenant's **Months** (`TenantPeriodsGrid`)
    and **Ledger** (`TenantLedgerTable`), and **Billing** (`BillingGrid`).
    Each is a `useServerGrid` client (below) over an SQL `…_page()`
    function. Copy the closest one.
  - Never "load 50 + Load older" on top of client paging: page numbers,
    search and Excel then cover only what was loaded, and a long history
    looks shorter than it is.

**Building a server-side table** (data side: `add-api-endpoint`, "A list
that grows"):
- Use the kit hook `useServerGrid` (`@/components/ui/DataTable`):
  - **Inputs:** `initial` (the first page from `serverApi`) *or* `empty`
    (a module-constant empty page: the table then loads its first page on
    mount, as in a lazy tab, A16), a stable `load(query)`,
    `toQuery(gridParams, extra)`, `defaultSort`, `defaultExtra` (the
    table's own inputs: "Show", dates) and `errorText`.
  - **Returns:** `data`, `error`, `extra` / `setExtra` and `gridProps`.
  - Spread `gridProps` on `DataTable`: `paginationMode="server"`,
    `rowCount` (matching), `totalCount` (all, so the chip reads "12 of
    340"), the controlled models and their handlers, `loading`, page sizes.
- **Guards built into the hook** (each was a bug; never re-implement them):
  - Return early when the new view equals the current one. The grid
    re-reports normalised models, and storing a fresh object each time is
    an infinite render loop that freezes the tab.
  - Skip the request when the query is unchanged.
  - Drop stale replies with a request counter.
  - Any change except the page number goes back to page 1, and adopt the
    page the server returns (it clamps a page past the end).
- **Columns:**
  - Text columns get `filterOperators: SERVER_TEXT_OPERATORS`.
  - A column whose value the database can't sort or match is
    `sortable: false` / `filterable: false`.
  - Every column's `field` maps to one database column in the service.
  - Search and filters must match the text the user sees. If a shown
    value is computed in JS (labels, formatted money), store it with the
    row (as `audit_log.title`/`details`, D27) or leave it out of search
    and say so.
- **Data flow:** a Server Component can't pass functions (columns, a load
  callback) to a client component. Pass plain data (`source`) and let the
  client table pick its columns and `api` call. The page loads the first
  page with `serverApi` and passes it as `initial`.
- **Export:** Excel downloads the page on screen, which is all the browser
  has. The tooltip says so ("Download this page").
- **Cards:** `AppCard` (`@/components/ui`) for every card surface: raised
  3D shadow, `href` turns the whole card into a link (lift + focus ring),
  `depth="flat"` for dashed/inset areas. Never import `@mui/material/Card`.
- **Loading:** from `@/components/ui/Loading`: `LoadingButton` (async
  actions: `loading`, or return a promise from `onClick`), `LinkButton`
  (instead of `<Button component={Link}>`), `Loader` (any other busy
  state), `useAppRouter()` (instead of `useRouter`, so navigations show the
  top progress bar).
- **Public pages** (login, confirm): `PublicLayout`, `PublicCard`, `PublicHeading`.

## Phones (below `sm`, 600px)

Most use is on a phone: design for one-thumb use and as little scrolling as
possible. The kit already does the work below, so use it rather than adding
`useMediaQuery` branches to a page.

- **Header buttons:** `ActionStack phone="primaryOnTop"` when there is one
  main action (Record payment, Add tenant). The last child, the primary,
  goes full width on top, and the rest pair two to a row below it (Edit |
  Move out). The default `phone="stack"` puts one button per row, which is
  fine for one or two controls.
  - A button that waits on data (Move out needs the amount owed) gets a
    disabled copy of itself as its `AsyncSection` fallback, not `null`,
    so the grid doesn't reflow when it arrives.
- **Destructive actions** are `variant="outlined" color="error"`: red on
  phone and desktop through the theme variant in
  `src/theme/customizations/app.ts`. The template's outlined style alone
  greys every colour but secondary, so don't style it ad hoc.
- **Tabs:** `PageTabs` becomes a full-width "Section" select on phones. Both
  controls render and CSS switches them, so there is no hydration flash.
  Don't add a phone variant of your own.
- **Tables:** the `DataTable` toolbar is one ~52px row on phones, built in
  `DataTableToolbar.tsx`:
  - the count chip, plus the title unless the table sits in a `PageTabs`
    panel (`InTabsContext`: the Section select already names it; the title
    stays for screen readers). The subtitle is hidden on phones;
  - 🔍 opens search across the whole row, and its ✕ clears and closes it;
  - the filter icon toggles an inline panel holding the "Show" selects, the
    `toolbarExtra` inputs (stretched full width) and "Column filters" /
    "Clear". Its badge counts changed "Show" selects, column filters and
    `toolbarExtraActive`. **Pass `toolbarExtraActive`** whenever
    `toolbarExtra` can narrow the rows (e.g. `Boolean(from || to)`), or
    the badge misses it;
  - the Columns and Excel icons stay inline.
  - The grid's column filter panel stacks each filter on phones (delete,
    then column / operator / value full width): `filterPanelSx` in
    `DataTable/styles.ts`, applied by `DataTable`. Its default single row
    is ~600px and scrolls sideways on a phone.
  - What narrows a table and how to clear it is one hook,
    `useTableFilters` (the empty-results overlay and the phone panel share
    it). Use it rather than re-deriving it.
- **Long pages:** keep what the common task needs (the header action, key
  figures) above the fold and move the rest into `PageTabs` (A16). Don't
  stack several tables on one phone screen.
- **Stats:** two `StatCard`s side by side (`{ xs: 6 }`) read well on a
  phone; three or more need `xs: 12` or a tab.

## Before you finish: review checklist

These mistakes have shipped before (see CLAUDE.md → "Single source of truth"):

- [ ] New page has its `ROUTE_LABELS` entry; data segment has `loading.tsx`
      (card-shaped skeletons) and, if it can 404, a specific `not-found.tsx`.
- [ ] No hex/rgba, no `"en-IN"`, no raw `yyyy-MM-dd`, no `.slice(0, 7)` on
      keys, no raw enum values (`bank_transfer`) in the UI.
- [ ] Limits, enum options and labels come from `validation.ts` /
      `types.ts` / `src/lib/domain/`, not literals in the form.
- [ ] Business rules (billing start, vacancy, overdue tone) call the
      `src/lib/domain/` helper instead of re-implementing it.
- [ ] Page links and flash params use the shared helpers; any `next`
      redirect goes through `safeNext`.
- [ ] A column, status badge, form-submit block or confirm dialog that
      already exists elsewhere is reused (or extracted now), not copied.
- [ ] Navigating buttons are `LinkButton`, spinners are `Loader`, kit
      imports come from the barrel, `useAppRouter` not `useRouter`.
- [ ] One component per file; `"use client"` only on the interactive file;
      `useId()` for ARIA ids; row buttons have a row-specific `aria-label`.
- [ ] `DataTable` columns/filters are stable (module const or `useMemo`).
- [ ] A table whose rows grow every month is server-side (A15), with the
      unchanged-view early return; master-data tables stay client-side.
- [ ] Phone (see "Phones"): the header uses `ActionStack phone="primaryOnTop"`
      when there's one main action; destructive buttons are outlined
      `color="error"`; a `toolbarExtra` that filters passes
      `toolbarExtraActive`; no page-level `useMediaQuery` where the kit
      already adapts.

## Verify

1. Run `npx tsc --noEmit -p .` and `npm run lint` (if a deleted route shows
   up in `.next/types`, run `npx next typegen`).
2. Check the page in Chrome against the running dev server (`localhost:3000`).
   The owner signs in themselves; never enter credentials.
   - Light and dark mode.
   - 375px width with no horizontal scroll. The page must not overflow;
     a table's own columns may scroll inside it. Also open the toolbar's
     filter panel and the column filters at that width.
   - No console errors.
   - Getting a phone-width view: `resize_window` may not shrink a
     maximized window, so check `innerWidth` after resizing. The app sends
     X-Frame-Options, so an iframe won't work. If the viewport stays wide,
     say so and ask the user to check in DevTools device mode rather than
     claiming the phone layout works.
