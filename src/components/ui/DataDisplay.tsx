// Presentational building blocks for dashboard pages. Colours and type come
// from the theme (incl. the app Chip/Avatar variants in
// src/theme/customizations/app.ts), so nothing here hard-codes a palette.
// Server-safe (no "use client"): Server Component pages render these
// directly; interactive pieces live in their own client files
// (e.g. DataTable).
import { useId } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import AppCard from "@/components/ui/AppCard";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "@/components/ui/Link";
import { IconTile } from "@/components/ui/Surfaces";

/* ------------------------------------------------------------------ */
/* Page header + panel frame                                           */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between" }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h4" component="h1">
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" color="textSecondary">
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {action ? <Box sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>{action}</Box> : null}
    </Stack>
  );
}

/** Card section whose body is usually a Data Grid running edge to edge (`flush`). */
export function DashboardCardPanel({
  title,
  subtitle,
  action,
  toolbar,
  flush = false,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Right-aligned header slot, e.g. a filter select or badges. */
  action?: React.ReactNode;
  /** Extra controls row under the header (e.g. date-range inputs). */
  toolbar?: React.ReactNode;
  flush?: boolean;
  children: React.ReactNode;
}) {
  const headingId = useId();
  const inset = flush ? { px: 2 } : undefined;
  return (
    <AppCard component="section" aria-labelledby={headingId} sx={flush ? { p: 0 } : undefined}>
      <Stack spacing={2} sx={flush ? { pt: 2 } : undefined}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between", ...inset }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography id={headingId} component="h2" variant="subtitle2">
              {title}
            </Typography>
            {subtitle ? (
              <Typography variant="caption" color="textSecondary" component="p">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
        </Stack>
        {toolbar ? <Box sx={inset}>{toolbar}</Box> : null}
        <Box>{children}</Box>
      </Stack>
    </AppCard>
  );
}

/* ------------------------------------------------------------------ */
/* Status badges + tags                                                */
/* ------------------------------------------------------------------ */

// StatusBadge is a client component: built in a Server Component, the
// identical dot `icon` elements get deduplicated in the RSC payload and Chip
// drops some of them during SSR (hydration mismatch).
export { StatusBadge, type BadgeTone } from "./StatusBadge";

/** Neutral, quieter label for categories (property name, unit, mode). */
export function TagPill({ label }: { label: string }) {
  return <Chip size="small" variant="tag" label={label} title={label} />;
}

/* ------------------------------------------------------------------ */
/* Identity cell                                                       */
/* ------------------------------------------------------------------ */

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function IdentityCell({ name, caption, href }: { name: string; caption?: string; href?: string }) {
  const content = (
    <>
      <Avatar variant="soft" sx={{ width: 32, height: 32, fontSize: 12 }}>
        {initials(name)}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap color="textPrimary">
          {name}
        </Typography>
        {caption ? (
          <Typography variant="caption" color="textSecondary" noWrap component="p">
            {caption}
          </Typography>
        ) : null}
      </Box>
    </>
  );
  const layout = { display: "flex", alignItems: "center", gap: 1.25, minWidth: 0, height: "100%" } as const;

  if (!href) return <Box sx={layout}>{content}</Box>;
  return (
    <Box
      component={Link}
      href={href}
      sx={{
        ...layout,
        color: "inherit",
        textDecoration: "none",
        "&:hover .MuiTypography-body2": { color: "primary.main", textDecoration: "underline" },
      }}
    >
      {content}
    </Box>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center", px: 3, py: 6 }}>
      {icon ? <IconTile icon={icon} tone="neutral" /> : null}
      <Typography variant="subtitle2">{title}</Typography>
      {description ? (
        <Typography variant="body2" color="textSecondary" sx={{ maxWidth: 360 }}>
          {description}
        </Typography>
      ) : null}
      {action ? <Box sx={{ pt: 1.5 }}>{action}</Box> : null}
    </Stack>
  );
}
