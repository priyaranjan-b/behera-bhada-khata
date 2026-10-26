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
import { FLASH, TAB_PARAM, routes, type Flash, type TenantTab } from "@/lib/routes";
import LinkButton from "@/components/ui/Loading/LinkButton";
import PageTabs, { type PageTab } from "@/components/ui/PageTabs";
import AuditHistoryTable from "@/components/domain/AuditHistoryTable";
import AccountStats, { AccountStatsSkeleton } from "./sections/AccountStats";
import MoveOutAction from "./sections/MoveOutAction";
import StopTrackingAction from "./sections/StopTrackingAction";
import TenantLedgerTable from "./TenantLedgerTable";
import TenantPeriodsGrid from "./TenantPeriodsGrid";

// The page waits only for the profile (who, which houses, which rents - and a
// 404 for a wrong id) and streams the account stats (A12). Everything else is
// a tab per data source (A16): Details shows the profile already loaded; the
// Ledger, Months and Change history tables load their own data when their tab
// is first opened, and keep it until the next write re-renders the page.
// Tenants with no rent months (Govt rent paid direct) get no account, Ledger
// or Months.

export default async function TenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Flash & { [TAB_PARAM]?: string }>;
}) {
  const { tenantId } = await params;
  const flash = await searchParams;
  // Each server render (after any write) is a new version: PageTabs then reloads its tables.
  // A Server Component renders once per request, so this is meant to differ every time.
  // eslint-disable-next-line react-hooks/purity -- a per-render token, not data
  const version = Date.now();
  const { tenant } = await serverApi.dashboard.tenants.detail(tenantId);
  const active = tenant.status === "active";
  const draft = tenant.status === "draft";
  // Government rent paid to the owner directly (0016): no months, no dues, no payments.
  const untracked = active && !tenant.rentTracked;
  const account = untracked ? null : serverApi.dashboard.tenants.account(tenantId);
  const houseHistory = [...tenant.unitHistory].reverse();
  const moveOut = { tenantId, tenantName: tenant.displayName, unitCodes: tenant.currentUnits.map((u) => u.unitCode) };

  const details = (
    <Grid container spacing={2} columns={12}>
      <Grid size={{ xs: 12, md: 6 }}>
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
            <DetailRow label="Moved in">{tenant.leaseStart ? formatDateKey(tenant.leaseStart) : "Not set"}</DetailRow>
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
      <Grid size={{ xs: 12, md: 6 }}>
        <Stack spacing={2}>
          <SectionCard title="House history">
            <DetailList dividers>
              {houseHistory.map((h) => (
                <DetailRow key={`${h.unitCode}-${h.startDate}`} label={h.unitCode}>
                  {formatDateKey(h.startDate)} → {h.endDate ? formatDateKey(h.endDate) : "now"}
                </DetailRow>
              ))}
            </DetailList>
          </SectionCard>
          <SectionCard title="Rent history">
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
        </Stack>
      </Grid>
    </Grid>
  );
  const tabs: (PageTab & { value: TenantTab })[] = [
    { value: "details", label: "Details", content: details },
    ...(account
      ? ([
          { value: "ledger", label: "Ledger", content: <TenantLedgerTable tenantId={tenantId} /> },
          { value: "months", label: "Months", content: <TenantPeriodsGrid tenantId={tenantId} /> },
        ] as const)
      : []),
    {
      value: "history",
      label: "Change history",
      content: (
        <AuditHistoryTable
          source={{ kind: "tenant", tenantId }}
          title="Change history"
          subtitle="Who changed what, and when"
          emptyDescription="Changes are recorded from when history was switched on."
        />
      ),
    },
  ];

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
          <ActionStack phone="primaryOnTop">
            <LinkButton href={routes.tenants.edit(tenantId)} variant="outlined" startIcon={<EditRoundedIcon />}>
              Edit
            </LinkButton>
            {!(active || draft) ? null : account ? (
              <AsyncSection title="Move out" fallback={<MoveOutButton {...moveOut} outstanding={0} disabled />} silent>
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
          number, then use Send link in the Ledger tab - or download the receipt and send it yourself.
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

      {account ? (
        <Grid container spacing={2} columns={12}>
          <AsyncSection title="Account" fallback={<AccountStatsSkeleton />}>
            <AccountStats account={account} />
          </AsyncSection>
        </Grid>
      ) : null}

      <PageTabs tabs={tabs} value={flash.tab} version={version} label="Tenant sections" />
    </Stack>
  );
}
