import Link from "@/components/ui/Link";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import MuiLink from "@mui/material/Link";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { serverApi } from "@/lib/api-client/server";
import { addMonthsToKey, formatMonth, monthKeyOf } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import FlashAlert from "@/components/ui/FlashAlert";
import StatCard from "@/components/ui/StatCard";
import { DashboardCardPanel, PageHeader, StatusBadge, TagPill } from "@/components/ui/DataDisplay";
import { ActionStack, BadgeRow, DetailList, DetailRow, SectionCard } from "@/components/ui";
import MoveOutButton from "@/components/domain/MoveOutButton";
import { unitMixLabel } from "@/lib/domain/tenant";
import TenantLedgerTable from "./TenantLedgerTable";
import TenantPeriodsGrid, { type TenantPeriodRow } from "./TenantPeriodsGrid";

export default async function TenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{
    paymentCreated?: string;
    resent?: string;
    notifyFailed?: string;
    error?: string;
    saved?: string;
    movedOut?: string;
  }>;
}) {
  const { tenantId } = await params;
  const flash = await searchParams;
  const { tenant, balance: summary, periods, ledger: ledgerRows } = await serverApi.dashboard.tenants.detail(tenantId);

  const periodRows: TenantPeriodRow[] = periods.map((p) => ({ ...p, monthLabel: formatMonth(p.periodMonth) }));
  const paidMonths = periodRows.filter((p) => p.status === "paid").length;
  const active = tenant.status === "active";
  const draft = tenant.status === "draft";
  const houseHistory = [...tenant.unitHistory].reverse();

  return (
    <Stack spacing={2}>
      <PageHeader
        title={tenant.displayName}
        subtitle={
          [
            tenant.businessName ? `Contact: ${tenant.name}` : null,
            draft ? "Draft - details missing" : active ? null : `Moved out ${tenant.movedOutOn}`,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        action={
          <ActionStack>
            <Button component={Link} href={`/dashboard/tenants/${tenantId}/edit`} variant="outlined" startIcon={<EditRoundedIcon />}>
              Edit
            </Button>
            {active || draft ? (
              <MoveOutButton
                tenantId={tenantId}
                tenantName={tenant.displayName}
                unitCodes={tenant.currentUnits.map((u) => u.unitCode)}
                outstanding={summary.totalOutstanding}
              />
            ) : null}
            {draft ? null : (
              <Button
                component={Link}
                href={`/dashboard/tenants/${tenantId}/payments/new`}
                variant="contained"
                startIcon={<AddRoundedIcon />}
              >
                Record payment
              </Button>
            )}
          </ActionStack>
        }
      />

      {draft ? (
        <Alert severity="info">
          This tenant comes from the paper register and isn&apos;t billed yet. Use <strong>Edit</strong> to add the
          phone, combined monthly rent and lease start - billing starts from the lease start.
        </Alert>
      ) : null}
      {flash.saved ? (
        <FlashAlert param="saved" severity="success">
          Tenant saved.
        </FlashAlert>
      ) : null}
      {flash.movedOut ? (
        <FlashAlert param="movedOut" severity="success">
          Moved out. Their houses are free for a new tenant; any dues stay on this ledger.
        </FlashAlert>
      ) : null}

      {flash.paymentCreated ? (
        <FlashAlert param="paymentCreated" severity="success">
          {flash.paymentCreated === "sent"
            ? "Recorded and counted. The tenant was sent a link to acknowledge it."
            : "Recorded and counted. Download the receipt from the ledger to send it yourself."}
        </FlashAlert>
      ) : null}
      {flash.notifyFailed ? (
        <FlashAlert param="notifyFailed" severity="warning">
          Recorded and counted, but the WhatsApp/SMS message couldn&apos;t be delivered. Check the tenant&apos;s
          number, then use Send link in the ledger below - or download the receipt and send it yourself.
        </FlashAlert>
      ) : null}
      {flash.resent ? (
        <FlashAlert param="resent" severity="success">
          Link sent to the tenant to acknowledge.
        </FlashAlert>
      ) : null}
      {flash.error ? (
        <FlashAlert param="error" severity="error">
          Something went wrong. Please try again.
        </FlashAlert>
      ) : null}

      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: 6 }}>
          <SectionCard title="Details" fill>
            <DetailList dividers>
              <DetailRow label="Status">
                {active ? (
                  <StatusBadge tone="success" label="Active" />
                ) : draft ? (
                  <StatusBadge tone="warning" label="Draft - details missing" />
                ) : (
                  <StatusBadge tone="neutral" label={`Moved out ${tenant.movedOutOn ?? ""}`} />
                )}
              </DetailRow>
              <DetailRow label={active || draft ? "Houses" : "Last houses"}>
                <Stack spacing={0.5} sx={{ alignItems: "flex-end" }}>
                  <TagPill label={unitMixLabel(tenant.unitMix)} />
                  {tenant.currentUnits.map((u) => (
                    <MuiLink key={u.unitCode} component={Link} href={`/dashboard/properties/${u.propertyCode}`}>
                      {u.unitCode}
                      {u.label ? ` · ${u.label}` : ""}
                    </MuiLink>
                  ))}
                </Stack>
              </DetailRow>
              <DetailRow label="Phone">
                {tenant.phone ? <MuiLink href={`tel:${tenant.phone}`}>{tenant.phone}</MuiLink> : "Not set"}
              </DetailRow>
              <DetailRow label="Combined rent">
                {tenant.monthlyRent > 0 ? `${formatMoney(tenant.monthlyRent)} / month` : "Not set"}
              </DetailRow>
              <DetailRow label="Security deposit">
                {tenant.depositAmount ? formatMoney(tenant.depositAmount) : draft ? "Not set" : "None"}
              </DetailRow>
              <DetailRow label="Moved in">{tenant.leaseStart ?? "Not set"}</DetailRow>
              <DetailRow label="Billing from">
                {tenant.billingStart
                  ? formatMonth(tenant.billingStart) +
                    (tenant.leaseStart && tenant.billingStart > monthKeyOf(tenant.leaseStart)
                      ? ` · paid up to ${formatMonth(addMonthsToKey(tenant.billingStart, -1))} before the app`
                      : "")
                  : "Not billed yet"}
              </DetailRow>
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

      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: 6 }}>
          <SectionCard title="House history" fill>
            <DetailList dividers>
              {houseHistory.map((h) => (
                <DetailRow key={`${h.unitCode}-${h.startDate}`} label={h.unitCode}>
                  {h.startDate} → {h.endDate ?? "now"}
                </DetailRow>
              ))}
            </DetailList>
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <SectionCard title="Rent history" fill>
            <DetailList dividers>
              {[...tenant.rentHistory].reverse().map((r) => (
                <DetailRow key={r.effectiveMonth} label={`From ${formatMonth(r.effectiveMonth)}`}>
                  <BadgeRow align="end">
                    <span>{formatMoney(r.monthlyAmount)}</span>
                  </BadgeRow>
                </DetailRow>
              ))}
            </DetailList>
          </SectionCard>
        </Grid>
      </Grid>

      <DashboardCardPanel title="Months" subtitle="Rent owed and allocated per month" flush>
        <TenantPeriodsGrid rows={periodRows} />
      </DashboardCardPanel>

      <TenantLedgerTable rows={ledgerRows} tenantId={tenantId} />
    </Stack>
  );
}
