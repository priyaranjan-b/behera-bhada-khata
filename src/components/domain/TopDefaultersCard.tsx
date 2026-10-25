import Link from "@/components/ui/Link";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import { BadgeRow, DetailList, SectionCard } from "@/components/ui";
import { EmptyState, StatusBadge } from "@/components/ui/DataDisplay";
import LinkButton from "@/components/ui/Loading/LinkButton";
import type { DashboardSummary } from "@/lib/contracts";
import { AGING_BAND_TONE } from "@/lib/domain/reports";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";

/** Overview: who is furthest behind today, with everyone's arrears by age band. */
export default function TopDefaultersCard({ defaulters }: { defaulters: DashboardSummary["defaulters"] }) {
  const { top, tenantCount, totalOutstanding, groups } = defaulters;
  return (
    <SectionCard
      title="Top defaulters"
      caption={
        tenantCount > 0
          ? `${formatMoney(totalOutstanding)} unpaid from ${tenantCount} tenant${tenantCount === 1 ? "" : "s"}`
          : undefined
      }
      action={
        tenantCount > top.length ? (
          <LinkButton href={routes.defaulters} size="small" variant="text">
            See all {tenantCount}
          </LinkButton>
        ) : undefined
      }
      fill
    >
      {tenantCount === 0 ? (
        <EmptyState icon={<TaskAltRoundedIcon />} title="No one is behind" description="Every ended month is paid." />
      ) : (
        <Stack spacing={2}>
          <BadgeRow>
            {groups
              .filter((g) => g.tenantCount > 0)
              .map((g) => (
                <StatusBadge
                  key={g.key}
                  tone={AGING_BAND_TONE[g.key]}
                  label={`${g.label}: ${g.tenantCount} · ${formatMoney(g.outstanding)}`}
                />
              ))}
          </BadgeRow>
          <DetailList dividers>
            {top.map((row) => (
              <Stack key={row.tenantId} direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Stack sx={{ minWidth: 0 }}>
                  <MuiLink component={Link} href={routes.tenants.detail(row.tenantId)} noWrap>
                    {row.displayName}
                  </MuiLink>
                  <Typography variant="caption" color="textSecondary" noWrap>
                    {[row.propertyName, row.movedOut ? "moved out" : null].filter(Boolean).join(" · ")}
                  </Typography>
                </Stack>
                <Stack spacing={0.5} sx={{ alignItems: "flex-end", flexShrink: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatMoney(row.totalOutstanding)}
                  </Typography>
                  <StatusBadge
                    tone={row.overdueMonths > 1 ? "danger" : "warning"}
                    label={`${row.overdueMonths} month${row.overdueMonths === 1 ? "" : "s"} behind`}
                  />
                </Stack>
              </Stack>
            ))}
          </DetailList>
        </Stack>
      )}
    </SectionCard>
  );
}
