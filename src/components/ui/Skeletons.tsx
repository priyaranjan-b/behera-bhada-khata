// Skeleton stand-ins for route-level `loading.tsx` files: one per card, sized
// like the real component so the page doesn't jump when data arrives.
// Server-safe (no "use client").
import Box from "@mui/material/Box";
import AppCard from "@/components/ui/AppCard";
import CardContent from "@mui/material/CardContent";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/** Wraps a page's skeletons and announces the loading state once. */
export function PageSkeleton({ label = "Loading…", children }: { label?: string; children: React.ReactNode }) {
  return (
    <Stack role="status" aria-live="polite" aria-label={label} aria-busy spacing={2}>
      {children}
    </Stack>
  );
}

/** Matches `PageHeader`: h4 title, body2 subtitle, optional action on the right. */
export function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <Stack
      aria-hidden
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between" }}
    >
      <Box sx={{ minWidth: 0, width: { xs: "100%", sm: 320 } }}>
        <Typography variant="h4">
          <Skeleton width="55%" />
        </Typography>
        <Typography variant="body2">
          <Skeleton width="90%" />
        </Typography>
      </Box>
      {action ? <Skeleton variant="rounded" width={200} height={40} /> : null}
    </Stack>
  );
}

/** Matches `StatCard`: title, value + badge, caption, 50px sparkline. */
export function StatCardSkeleton() {
  return (
    <AppCard aria-hidden sx={{ height: "100%", flexGrow: 1 }}>
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          <Skeleton width="40%" />
        </Typography>
        <Stack sx={{ gap: 1 }}>
          <Stack>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, gap: { xs: 0.5, sm: 1 } }}
            >
              <Typography variant="h4" sx={{ flexGrow: 1, width: "100%", typography: { xs: "h6", sm: "h4" } }}>
                <Skeleton width="60%" />
              </Typography>
              <Skeleton variant="rounded" width={64} height={24} />
            </Stack>
            <Typography variant="caption">
              <Skeleton width="70%" />
            </Typography>
          </Stack>
          <Skeleton variant="rounded" height={50} sx={{ display: { xs: "none", sm: "block" } }} />
        </Stack>
      </CardContent>
    </AppCard>
  );
}

/** Matches `BillingCollectionChart`: header row, total, caption, 260px chart. */
export function ChartCardSkeleton({ height = 260 }: { height?: number }) {
  return (
    <AppCard aria-hidden sx={{ width: "100%" }}>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ width: 160 }}>
            <Skeleton />
          </Typography>
          <Skeleton variant="rounded" width={96} height={30} />
        </Stack>
        <Typography variant="h4" sx={{ width: 180 }}>
          <Skeleton />
        </Typography>
        <Typography variant="caption" component="p" sx={{ width: 240 }}>
          <Skeleton />
        </Typography>
        <Skeleton variant="rounded" height={height} sx={{ mt: 2.5 }} />
      </CardContent>
    </AppCard>
  );
}

/** Matches a `SectionCard` of `DetailRow`s (label left, value right). */
export function DetailCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <AppCard aria-hidden component="section">
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="subtitle2" sx={{ width: 160 }}>
            <Skeleton />
          </Typography>
          <Skeleton variant="rounded" width={72} height={24} />
        </Stack>
        {Array.from({ length: rows }, (_, i) => (
          <Stack key={i} direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
            <Typography variant="body2" sx={{ width: "30%" }}>
              <Skeleton />
            </Typography>
            <Typography variant="body2" sx={{ width: "40%" }}>
              <Skeleton />
            </Typography>
          </Stack>
        ))}
      </Stack>
    </AppCard>
  );
}

/** Matches a section heading over a group of cards: h6 title, body2 caption (a site on Properties). */
export function SectionHeadingSkeleton() {
  return (
    <Box aria-hidden>
      <Typography variant="h6" sx={{ width: 260, maxWidth: "70%" }}>
        <Skeleton />
      </Typography>
      <Typography variant="body2" sx={{ width: 340, maxWidth: "90%" }}>
        <Skeleton />
      </Typography>
    </Box>
  );
}

/**
 * Matches a linked tile card: 40px `IconTile` + name/code + chevron, a strong
 * `SummaryLine` and a badge row (a tower card on Properties).
 */
export function TileCardSkeleton() {
  return (
    <AppCard aria-hidden sx={{ height: "100%" }}>
      <Stack spacing={2}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
          <Skeleton variant="rounded" width={40} height={40} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle2" sx={{ width: "60%" }}>
              <Skeleton />
            </Typography>
            <Typography variant="caption" component="p" sx={{ width: "30%" }}>
              <Skeleton />
            </Typography>
          </Box>
          <Skeleton variant="circular" width={24} height={24} />
        </Stack>
        <Stack direction="row" sx={{ justifyContent: "space-between", gap: 2 }}>
          <Typography variant="body2" sx={{ width: "35%" }}>
            <Skeleton />
          </Typography>
          <Typography variant="subtitle2" sx={{ width: "30%" }}>
            <Skeleton />
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Skeleton variant="rounded" width={88} height={20} />
          <Skeleton variant="rounded" width={96} height={20} />
          <Skeleton variant="rounded" width={88} height={20} />
        </Stack>
      </Stack>
    </AppCard>
  );
}

/** Matches a `DataTable`: one toolbar row, a header band and 56px rows. */
export function PanelSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <AppCard aria-hidden component="section" sx={{ p: 0 }}>
      <Stack
        direction="row"
        sx={{ alignItems: "center", gap: 2, px: 2, py: 1.25, minHeight: 60, borderBottom: 1, borderColor: "divider" }}
      >
        <Typography variant="subtitle1" sx={{ width: 160 }}>
          <Skeleton />
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Skeleton variant="rounded" width={150} height={36} sx={{ borderRadius: 999, display: { xs: "none", sm: "block" } }} />
        <Skeleton variant="rounded" width={220} height={36} sx={{ borderRadius: 999, display: { xs: "none", sm: "block" } }} />
        <Skeleton variant="circular" width={36} height={36} />
        <Skeleton variant="circular" width={36} height={36} />
      </Stack>
      <Skeleton variant="rectangular" height={44} />
      {Array.from({ length: rows }, (_, i) => (
        <Stack
          key={i}
          direction="row"
          spacing={1.25}
          sx={{ alignItems: "center", height: 56, px: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Skeleton variant="circular" width={32} height={32} sx={{ flexShrink: 0 }} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2">
              <Skeleton width="30%" />
            </Typography>
            <Typography variant="caption">
              <Skeleton width="20%" />
            </Typography>
          </Box>
          <Skeleton variant="rounded" width={72} height={24} />
        </Stack>
      ))}
    </AppCard>
  );
}
