import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import MuiLink from "@mui/material/Link";
import type { TenantDetail } from "@/lib/contracts";
import { addMonthsToKey, formatDateKey, formatMonth, monthKeyOf } from "@/lib/dates";
import { unitMixLabel } from "@/lib/domain/tenant";
import { formatMoney } from "@/lib/money";
import { routes } from "@/lib/routes";
import { BadgeRow, DetailList, DetailRow, SectionCard } from "@/components/ui";
import { TagPill } from "@/components/ui/DataDisplay";
import TextLink from "@/components/ui/TextLink";
import TenantKindTags from "@/components/domain/TenantKindTags";
import TenantStatusBadge from "@/components/domain/TenantStatusBadge";

/**
 * A tenant page's Details tab: who they are, their houses and rents, then
 * the house and rent history. The owner's tenant page (`audience="owner"`,
 * with its Correct buttons passed in) and the tenant portal (`"tenant"`, A32:
 * read-only, the tenant's own words, no links into the owner's pages) show
 * the same facts from this one component.
 */
export default function TenantDetailsCards({
  tenant,
  audience,
  rentAction,
  billingActions,
}: {
  tenant: TenantDetail["tenant"];
  audience: "owner" | "tenant";
  /** Owner only: next to the rent (Correct rent). */
  rentAction?: React.ReactNode;
  /** Owner only: next to "Billing from" (Correct paid up to, Stop tracking). */
  billingActions?: React.ReactNode;
}) {
  const owner = audience === "owner";
  const active = tenant.status === "active";
  const draft = tenant.status === "draft";
  // Government rent paid to the owner directly (0016): no months, no dues.
  const untracked = active && !tenant.rentTracked;
  const houseHistory = [...tenant.unitHistory].reverse();
  const paidUpToBefore =
    tenant.billingStart && tenant.leaseStart && tenant.billingStart > monthKeyOf(tenant.leaseStart)
      ? ` · paid up to ${formatMonth(addMonthsToKey(tenant.billingStart, -1))} before the app`
      : "";

  return (
    <Grid container spacing={2} columns={12}>
      <Grid size={{ xs: 12, md: 6 }}>
        <SectionCard title={owner ? "Details" : "Your tenancy"} fill>
          <DetailList dividers>
            <DetailRow label="Status">
              <TenantStatusBadge status={tenant.status} movedOutOn={tenant.movedOutOn} />
            </DetailRow>
            {owner ? (
              <DetailRow label="Tenant type">
                <BadgeRow align="end">
                  <TenantKindTags tenantKind={tenant.tenantKind} rentTracked={tenant.rentTracked} />
                </BadgeRow>
              </DetailRow>
            ) : null}
            <DetailRow label={active || draft ? "Houses" : "Last houses"}>
              <Stack spacing={0.5} sx={{ alignItems: "flex-end" }}>
                <TagPill label={unitMixLabel(tenant.unitMix)} />
                {tenant.currentUnits.map((u) => {
                  const name = `${u.unitCode}${u.label ? ` · ${u.label}` : ""}`;
                  return owner ? (
                    <TextLink key={u.unitCode} href={routes.properties.detail(u.propertyCode)}>
                      {name}
                    </TextLink>
                  ) : (
                    <span key={u.unitCode}>{name}</span>
                  );
                })}
              </Stack>
            </DetailRow>
            <DetailRow label={owner ? "Phone" : "Mobile"}>
              {tenant.phone ? owner ? <MuiLink href={`tel:${tenant.phone}`}>{tenant.phone}</MuiLink> : tenant.phone : "Not set"}
            </DetailRow>
            <DetailRow label={untracked ? "Agreement rent" : owner ? "Combined rent" : "Monthly rent"}>
              {tenant.monthlyRent > 0 ? `${formatMoney(tenant.monthlyRent)} / month` : "Not set"}
              {rentAction}
            </DetailRow>
            <DetailRow label="Security deposit">
              {tenant.depositAmount ? formatMoney(tenant.depositAmount) : draft ? "Not set" : "None"}
            </DetailRow>
            <DetailRow label="Moved in">{tenant.leaseStart ? formatDateKey(tenant.leaseStart) : "Not set"}</DetailRow>
            <DetailRow label={owner ? "Billing from" : "Rent tracked from"}>
              {tenant.billingStart
                ? formatMonth(tenant.billingStart) + paidUpToBefore
                : untracked
                  ? owner
                    ? "Not tracked - paid to you directly"
                    : "Paid to your landlord's bank directly"
                  : owner
                    ? "Not billed yet"
                    : "Not yet"}
              {billingActions}
            </DetailRow>
          </DetailList>
        </SectionCard>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Stack spacing={2}>
          <SectionCard title="House history">
            <DetailList dividers>
              {houseHistory.map((h) => (
                <DetailRow key={`${h.unitCode}-${h.startDate}`} label={h.label ? `${h.unitCode} · ${h.label}` : h.unitCode}>
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
}
