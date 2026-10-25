import Link from "@/components/ui/Link";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import MuiLink from "@mui/material/Link";
import Alert from "@mui/material/Alert";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import { serverApi } from "@/lib/api-client/server";
import { addMonthsToKey, formatDateKey, formatMonth, monthKeyOf } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import FlashAlert from "@/components/ui/FlashAlert";
import { PageHeader, TagPill } from "@/components/ui/DataDisplay";
import TenantStatusBadge from "@/components/domain/TenantStatusBadge";
import { ActionStack, BadgeRow, DetailList, DetailRow, SectionCard } from "@/components/ui";
import MoveOutButton from "@/components/domain/MoveOutButton";
import AsyncSection from "@/components/ui/AsyncSection";
import CorrectPaidThroughButton from "@/components/domain/CorrectPaidThroughButton";
import RentTrackingButton from "@/components/domain/RentTrackingButton";
import TenantKindTags from "@/components/domain/TenantKindTags";
import { unitMixLabel } from "@/lib/domain/tenant";
import { FLASH, routes, type Flash } from "@/lib/routes";
import LinkButton from "@/components/ui/Loading/LinkButton";
import { DetailCardSkeleton, PanelSkeleton, StatCardSkeleton } from "@/components/ui/Skeletons";
import TenantChangeHistory from "./TenantChangeHistory";
import AccountStats, { ACCOUNT_STAT_CELL } from "./sections/AccountStats";
import LedgerSection from "./sections/LedgerSection";
import MonthsSection from "./sections/MonthsSection";
import MoveOutAction from "./sections/MoveOutAction";
import StopTrackingAction from "./sections/StopTrackingAction";

// The page loads in sections (A12): it waits only for the profile (who, which
// houses, which rents - and a 404 for a wrong id), then streams the account
// (balance, months) and the ledger, each in its own boundary. Tenants with no
// rent months to show (Govt rent paid direct) never start those calls.

export default async function TenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Flash>;
}) {
  const { tenantId } = await params;
  const flash = await searchParams;
  const { tenant } = await serverApi.dashboard.tenants.detail(tenantId);
  const active = tenant.status === "active";
  const draft = tenant.status === "draft";
  // Government rent paid to the owner directly (0016): no months, no dues, no payments.
  const untracked = active && !tenant.rentTracked;
  const account = untracked ? null : serverApi.dashboard.tenants.account(tenantId);
  const ledger = untracked ? null : serverApi.dashboard.tenants.ledger(tenantId);
  const houseHistory = [...tenant.unitHistory].reverse();
  const moveOut = { tenantId, tenantName: tenant.displayName, unitCodes: tenant.currentUnits.map((u) => u.unitCode) };

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
            {!(active || draft) ? null : account ? (
              <AsyncSection title="Move out" fallback={null} silent>
                <MoveOutAction account={account} {...moveOut} />
              </AsyncSection>
            ) : (
              // Untracked: nothing is ever owed.
              <MoveOutButton {...moveOut} outstanding={0} />
            )}
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
                {account && tenant.tenantKind === "government" ? (
                  <AsyncSection title="Stop tracking" fallback={null} silent>
                    <StopTrackingAction tenantId={tenantId} account={account} />
                  </AsyncSection>
                ) : null}
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
        {account ? (
          <AsyncSection
            title="Account"
            fallback={[0, 1].map((i) => (
              <Grid key={i} size={ACCOUNT_STAT_CELL}>
                <StatCardSkeleton />
              </Grid>
            ))}
          >
            <AccountStats account={account} />
          </AsyncSection>
        ) : null}
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

      {account ? (
        <AsyncSection title="Months" fallback={<PanelSkeleton rows={6} />}>
          <MonthsSection account={account} />
        </AsyncSection>
      ) : null}
      {ledger ? (
        <AsyncSection title="Ledger" fallback={<PanelSkeleton rows={6} />}>
          <LedgerSection tenantId={tenantId} ledger={ledger} />
        </AsyncSection>
      ) : null}

      <AsyncSection title="Change history" fallback={<DetailCardSkeleton rows={6} />}>
        <TenantChangeHistory tenantId={tenantId} />
      </AsyncSection>
    </Stack>
  );
}
