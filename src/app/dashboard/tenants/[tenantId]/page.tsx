import { Suspense } from "react";
import Link from "@/components/ui/Link";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import MuiLink from "@mui/material/Link";
import Alert from "@mui/material/Alert";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { serverApi } from "@/lib/api-client/server";
import { addMonthsToKey, currentMonthKey, formatDateKey, formatMonth, monthKeyOf } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import FlashAlert from "@/components/ui/FlashAlert";
import StatCard from "@/components/ui/StatCard";
import { PageHeader, TagPill } from "@/components/ui/DataDisplay";
import TenantStatusBadge from "@/components/domain/TenantStatusBadge";
import { ActionStack, BadgeRow, DetailList, DetailRow, SectionCard } from "@/components/ui";
import MoveOutButton from "@/components/domain/MoveOutButton";
import CorrectPaidThroughButton from "@/components/domain/CorrectPaidThroughButton";
import RentTrackingButton from "@/components/domain/RentTrackingButton";
import TenantKindTags from "@/components/domain/TenantKindTags";
import { unitMixLabel } from "@/lib/domain/tenant";
import { FLASH, routes, type Flash } from "@/lib/routes";
import TenantLedgerTable from "./TenantLedgerTable";
import TenantPeriodsGrid, { type TenantPeriodRow } from "./TenantPeriodsGrid";
import LinkButton from "@/components/ui/Loading/LinkButton";
import { DetailCardSkeleton } from "@/components/ui/Skeletons";
import TenantChangeHistory from "./TenantChangeHistory";

export default async function TenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Flash>;
}) {
  const { tenantId } = await params;
  const flash = await searchParams;
  const {
    tenant,
    balance: summary,
    periods,
    ledger: ledgerRows,
    tenantMessaging,
    canStopRentTracking,
  } = await serverApi.dashboard.tenants.detail(tenantId);

  const thisMonth = currentMonthKey();
  const periodRows: TenantPeriodRow[] = periods.map((p) => ({
    ...p,
    monthLabel: formatMonth(p.periodMonth),
    notYetDue: p.periodMonth >= thisMonth,
  }));
  // Only months that have ended are owed (summarizeBalance); later ones are billed ahead.
  const endedRows = periodRows.filter((p) => !p.notYetDue);
  const paidMonths = endedRows.filter((p) => p.status === "paid").length;
  const active = tenant.status === "active";
  const draft = tenant.status === "draft";
  // Government rent paid to the owner directly (0016): no months, no dues, no payments.
  const untracked = active && !tenant.rentTracked;
  const houseHistory = [...tenant.unitHistory].reverse();

  return (
    <Stack spacing={2}>
      <PageHeader
        title={tenant.displayName}
        subtitle={
          [
            tenant.businessName ? `Contact: ${tenant.name}` : null,
            draft ? "Draft - details missing" : active ? null : `Moved out ${tenant.movedOutOn ? formatDateKey(tenant.movedOutOn) : ""}`,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        action={
          <ActionStack>
            <LinkButton href={routes.tenants.edit(tenantId)} variant="outlined" startIcon={<EditRoundedIcon />}>
              Edit
            </LinkButton>
            {active || draft ? (
              <MoveOutButton
                tenantId={tenantId}
                tenantName={tenant.displayName}
                unitCodes={tenant.currentUnits.map((u) => u.unitCode)}
                outstanding={summary.totalOutstanding}
              />
            ) : null}
            {draft || untracked ? null : (
              <LinkButton
                href={routes.tenants.newPayment(tenantId)}
                variant="contained"
                startIcon={<AddRoundedIcon />}
              >
                Record payment
              </LinkButton>
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
      {untracked && tenant.leaseStart ? (
        <Alert
          severity="info"
          action={
            <RentTrackingButton
              mode="start"
              tenantId={tenantId}
              leaseStart={tenant.leaseStart}
              agreementRent={tenant.monthlyRent}
            />
          }
        >
          Government tenant: rent is paid to your bank directly under the agreement, so it isn&apos;t tracked here - no
          months fall due and they never show as defaulters. Start tracking to bill them like any other tenant.
        </Alert>
      ) : null}
      {flash.saved ? (
        <FlashAlert param={FLASH.saved} severity="success">
          Tenant saved.
        </FlashAlert>
      ) : null}
      {flash.movedOut ? (
        <FlashAlert param={FLASH.movedOut} severity="success">
          Moved out. Their houses are free for a new tenant; any dues stay on this ledger.
        </FlashAlert>
      ) : null}

      {flash.paymentCreated ? (
        <FlashAlert param={FLASH.paymentCreated} severity="success">
          {flash.paymentCreated === "sent"
            ? "Recorded and counted. The tenant was sent a link to acknowledge it."
            : "Recorded and counted. Download the receipt from the ledger to send it yourself."}
        </FlashAlert>
      ) : null}
      {flash.notifyFailed ? (
        <FlashAlert param={FLASH.notifyFailed} severity="warning">
          Recorded and counted, but the WhatsApp/SMS message couldn&apos;t be delivered. Check the tenant&apos;s
          number, then use Send link in the ledger below - or download the receipt and send it yourself.
        </FlashAlert>
      ) : null}
      {flash.resent ? (
        <FlashAlert param={FLASH.resent} severity="success">
          Link sent to the tenant to acknowledge.
        </FlashAlert>
      ) : null}
      {flash.error ? (
        <FlashAlert param={FLASH.error} severity="error">
          Something went wrong. Please try again.
        </FlashAlert>
      ) : null}

      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: untracked ? 12 : 6 }}>
          <SectionCard title="Details" fill>
            <DetailList dividers>
              <DetailRow label="Status">
                <TenantStatusBadge status={tenant.status} movedOutOn={tenant.movedOutOn} />
              </DetailRow>
              <DetailRow label="Tenant type">
                <BadgeRow align="end">
                  <TenantKindTags tenantKind={tenant.tenantKind} rentTracked={tenant.rentTracked} />
                </BadgeRow>
              </DetailRow>
              <DetailRow label={active || draft ? "Houses" : "Last houses"}>
                <Stack spacing={0.5} sx={{ alignItems: "flex-end" }}>
                  <TagPill label={unitMixLabel(tenant.unitMix)} />
                  {tenant.currentUnits.map((u) => (
                    <MuiLink key={u.unitCode} component={Link} href={routes.properties.detail(u.propertyCode)}>
                      {u.unitCode}
                      {u.label ? ` · ${u.label}` : ""}
                    </MuiLink>
                  ))}
                </Stack>
              </DetailRow>
              <DetailRow label="Phone">
                {tenant.phone ? <MuiLink href={`tel:${tenant.phone}`}>{tenant.phone}</MuiLink> : "Not set"}
              </DetailRow>
              <DetailRow label={untracked ? "Agreement rent" : "Combined rent"}>
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
                  : untracked
                    ? "Not tracked - paid to you directly"
                    : "Not billed yet"}
                {canStopRentTracking ? <RentTrackingButton mode="stop" tenantId={tenantId} /> : null}
                {active && tenant.leaseStart && tenant.billingStart ? (
                  <CorrectPaidThroughButton
                    tenantId={tenantId}
                    leaseStart={tenant.leaseStart}
                    billingStart={tenant.billingStart}
                  />
                ) : null}
              </DetailRow>
            </DetailList>
          </SectionCard>
        </Grid>
        {untracked ? null : (
          <>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                title="Outstanding"
                value={formatMoney(summary.totalOutstanding)}
                caption={
                  summary.notYetDue > 0
                    ? `To end of ${formatMonth(addMonthsToKey(thisMonth, -1))} · ${formatMoney(summary.notYetDue)} not due yet`
                    : `To end of ${formatMonth(addMonthsToKey(thisMonth, -1))}`
                }
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
                caption={`${paidMonths} of ${endedRows.length} ended month${endedRows.length === 1 ? "" : "s"} paid`}
                badge={
                  summary.overdueMonths > 0
                    ? { label: "Follow up", tone: "danger" }
                    : { label: "On track", tone: "success" }
                }
              />
            </Grid>
          </>
        )}
      </Grid>

      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, md: 6 }}>
          <SectionCard title="House history" fill>
            <DetailList dividers>
              {houseHistory.map((h) => (
                <DetailRow key={`${h.unitCode}-${h.startDate}`} label={h.unitCode}>
                  {formatDateKey(h.startDate)} → {h.endDate ? formatDateKey(h.endDate) : "now"}
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

      {untracked ? null : (
        <>
          <TenantPeriodsGrid rows={periodRows} />
          <TenantLedgerTable rows={ledgerRows} tenantId={tenantId} tenantMessaging={tenantMessaging} />
        </>
      )}

      <Suspense fallback={<DetailCardSkeleton rows={6} />}>
        <TenantChangeHistory tenantId={tenantId} />
      </Suspense>
    </Stack>
  );
}
