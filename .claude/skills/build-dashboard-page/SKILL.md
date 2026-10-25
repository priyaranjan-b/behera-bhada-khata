---
name: build-dashboard-page
description: Build or restyle a page or UI component in Behera Bhada Khata (Next.js 16 App Router + MUI v9 Dashboard template theme). Covers where the page file goes, how it gets data (serverApi / api), breadcrumbs, the shared UI kit, and the "pages are layout-only" styling rules incl. MUI v9 gotchas. Use when adding a screen under src/app, a form, a data grid, or changing visuals.
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
      never a new skeleton component per card;
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
  - **`loading.tsx`:** add one only when the segment has no child pages. A
    `loading.tsx` in `[tenantId]/` would also show while `/edit` and the
    payment modal load. Those record pages rely on their section fallbacks
    and the generic dashboard skeleton instead.
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
  to the page. Row types come from `src/lib/contracts.ts`.
- **Cards:** `AppCard` (`@/components/ui`) for every card surface: raised
  3D shadow, `href` turns the whole card into a link (lift + focus ring),
  `depth="flat"` for dashed/inset areas. Never import `@mui/material/Card`.
- **Loading:** from `@/components/ui/Loading`: `LoadingButton` (async
  actions: `loading`, or return a promise from `onClick`), `LinkButton`
  (instead of `<Button component={Link}>`), `Loader` (any other busy
  state), `useAppRouter()` (instead of `useRouter`, so navigations show the
  top progress bar).
- **Public pages** (login, confirm): `PublicLayout`, `PublicCard`, `PublicHeading`.

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

## Verify

1. Run `npx tsc --noEmit -p .` and `npm run lint` (if a deleted route shows
   up in `.next/types`, run `npx next typegen`).
2. Check the page in Chrome against the running dev server (`localhost:3000`).
   The owner signs in themselves; never enter credentials.
   - Light and dark mode.
   - 375px width with no horizontal scroll.
   - No console errors.
