import Link from "@/components/Link";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import MuiLink from "@mui/material/Link";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { serverApi } from "@/lib/api-client/server";
import { formatMoney } from "@/lib/money";
import StatCard from "@/components/StatCard";
import { DashboardCardPanel, PageHeader, TagPill } from "@/components/DataComponents";
import { DetailList, DetailRow, SectionCard } from "@/components/ui";
import TenantLedgerTable from "./TenantLedgerTable";
import TenantPeriodsGrid, { type TenantPeriodRow } from "./TenantPeriodsGrid";

function formatMonth(periodMonth: string) {
  return new Date(`${periodMonth}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export default async function TenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ paymentCreated?: string; resent?: string; error?: string }>;
}) {
  const { tenantId } = await params;
  const flash = await searchParams;
  const { tenant, balance: summary, periods, ledger: ledgerRows } = await serverApi.dashboard.tenants.detail(tenantId);

  const periodRows: TenantPeriodRow[] = periods.map((p) => ({ ...p, monthLabel: formatMonth(p.periodMonth) }));
  const paidMonths = periodRows.filter((p) => p.status === "paid").length;

  return (
    <Stack spacing={2}>
      <PageHeader
        title={tenant.displayName}
        subtitle={tenant.businessName ? `Contact: ${tenant.name}` : undefined}
        action={
          <Button
            component={Link}
            href={`/dashboard/tenants/${tenantId}/payments/new`}
            variant="contained"
            startIcon={<AddRoundedIcon />}
          >
            Record payment
          </Button>
        }
      />

      {flash.paymentCreated ? <Alert severity="success">Payment recorded and sent for confirmation.</Alert> : null}
      {flash.resent ? <Alert severity="success">Confirmation link resent.</Alert> : null}
      {flash.error ? <Alert severity="error">Something went wrong.</Alert> : null}

      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: 6 }}>
          <SectionCard title="Details" fill>
            <DetailList dividers>
              <DetailRow label="Property">
                <MuiLink component={Link} href={`/dashboard/properties/${tenant.propertyId}`}>
                  {tenant.propertyName}
                </MuiLink>
              </DetailRow>
              <DetailRow label="Unit">
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
                  <TagPill label={tenant.unitType === "commercial" ? "Commercial" : "Residential"} />
                  {tenant.unitLabel ? <span>{tenant.unitLabel}</span> : null}
                </Stack>
              </DetailRow>
              <DetailRow label="Phone">
                <MuiLink href={`tel:${tenant.phone}`}>{tenant.phone}</MuiLink>
              </DetailRow>
              <DetailRow label="Monthly rent">{formatMoney(tenant.monthlyRent)}</DetailRow>
            </DetailList>
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Outstanding"
            value={formatMoney(summary.totalOutstanding)}
            caption="All-time balance"
            badge={
              summary.totalOutstanding > 0
                ? { label: "To collect", tone: "warning" }
                : { label: "Settled", tone: "success" }
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Months overdue"
            value={String(summary.overdueMonths)}
            caption={`${paidMonths} of ${periodRows.length} month${periodRows.length === 1 ? "" : "s"} paid`}
            badge={
              summary.overdueMonths > 0
                ? { label: "Follow up", tone: "danger" }
                : { label: "On track", tone: "success" }
            }
          />
        </Grid>
      </Grid>

      <DashboardCardPanel title="Months" subtitle="Rent owed and allocated per month" flush>
        <TenantPeriodsGrid rows={periodRows} />
      </DashboardCardPanel>

      <TenantLedgerTable rows={ledgerRows} tenantId={tenantId} />
    </Stack>
  );
}
