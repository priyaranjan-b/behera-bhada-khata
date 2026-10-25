"use client";

import { usePathname } from "next/navigation";
import Breadcrumbs, { breadcrumbsClasses } from "@mui/material/Breadcrumbs";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import NavigateNextRoundedIcon from "@mui/icons-material/NavigateNextRounded";
import Link from "@/components/ui/Link";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Every owner page and its breadcrumb label; "/" (the Overview) starts every
 * trail. `:id` matches any dynamic segment. Add a line here when adding a
 * page; URL prefixes with no page of their own (e.g. /payments) are skipped.
 */
const ROUTE_LABELS: Record<string, string> = {
  "/": "Overview",
  "/properties": "Properties",
  "/properties/new": "New property",
  "/properties/:id": "Property",
  "/properties/:id/tenants/new": "New tenant",
  "/properties/:id/tenants/bulk": "Bulk upload",
  "/properties/:id/units/new": "Add house",
  "/tenants": "Tenants",
  "/tenants/new": "Add tenant",
  "/tenants/:id": "Tenant",
  "/tenants/:id/edit": "Edit",
  "/houses": "Houses",
  "/houses/new": "Add house",
  "/tenants/:id/payments/new": "Record payment",
  "/payments/:id/adjust": "Adjust payment",
  "/profile": "Profile",
  "/defaulters": "Defaulters",
  "/billing": "Billing",
  "/activity": "Activity",
};

const ROUTES = Object.entries(ROUTE_LABELS).map(([pattern, label]) => ({
  segments: pattern.split("/").filter(Boolean),
  label,
}));

// Static segments win over `:id` (so /properties/new is "New property", not "Property").
function labelFor(segments: string[]): string | undefined {
  let fallback: string | undefined;
  for (const route of ROUTES) {
    if (route.segments.length !== segments.length) continue;
    let exact = true;
    const matches = route.segments.every((s, i) => {
      if (s === segments[i]) return true;
      exact = false;
      return s === ":id";
    });
    if (!matches) continue;
    if (exact) return route.label;
    fallback ??= route.label;
  }
  return fallback;
}

/** Breadcrumb trail for a pathname: one crumb per URL prefix that is a page. The last one has no link. */
export function crumbsForPath(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  // i = 0 is "/" (the Overview), the root of every trail.
  for (let i = 0; i <= parts.length; i++) {
    const label = labelFor(parts.slice(0, i));
    if (label) crumbs.push({ label, href: `/${parts.slice(0, i).join("/")}` });
  }
  if (crumbs.length) crumbs[crumbs.length - 1].href = undefined;
  return crumbs;
}

/** Breadcrumbs for the current URL, rendered by the app layout above every page. */
export function AppBreadcrumbs() {
  const crumbs = crumbsForPath(usePathname());
  if (crumbs.length < 2) return null;

  return (
    <Breadcrumbs
      aria-label="Breadcrumb"
      separator={<NavigateNextRoundedIcon fontSize="small" />}
      sx={(theme) => ({
        [`& .${breadcrumbsClasses.separator}`]: { color: (theme.vars || theme).palette.action.disabled, m: "1px" },
        [`& .${breadcrumbsClasses.ol}`]: { alignItems: "center" },
      })}
    >
      {crumbs.map((crumb) =>
        crumb.href ? (
          // sx, not the color prop: the template's MuiLink override pins links to text.primary.
          <MuiLink
            key={crumb.href}
            component={Link}
            href={crumb.href}
            underline="hover"
            variant="body2"
            sx={{ color: "text.secondary", "&:hover": { color: "text.primary" } }}
          >
            {crumb.label}
          </MuiLink>
        ) : (
          <Typography key={crumb.label} variant="body2" color="textPrimary" aria-current="page">
            {crumb.label}
          </Typography>
        )
      )}
    </Breadcrumbs>
  );
}
