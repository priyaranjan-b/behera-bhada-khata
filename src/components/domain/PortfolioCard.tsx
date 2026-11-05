import { DetailList, DetailRow, SectionCard } from "@/components/ui";
import TextLink from "@/components/ui/TextLink";
import { routes } from "@/lib/routes";
import type { PortfolioFacts } from "@/lib/contracts";
import { formatMoney } from "@/lib/money";

/** Overview: standing facts about the rent book - rent roll, occupancy, deposits, advances, rent paid direct. */
export default function PortfolioCard({
  portfolio,
  houses,
}: {
  portfolio: PortfolioFacts;
  houses: { total: number; vacant: number };
}) {
  const let_ = houses.total - houses.vacant;
  const occupancy = houses.total > 0 ? Math.round((let_ / houses.total) * 100) : null;
  return (
    <SectionCard title="Portfolio" fill collapseOnPhone>
      <DetailList dividers>
        <DetailRow label="Monthly rent roll">
          <TextLink href={routes.tenants.list({ show: "current" })}>
            {formatMoney(portfolio.rentRoll)}
          </TextLink>
        </DetailRow>
        <DetailRow label="Occupancy">
          {occupancy === null ? (
            "—"
          ) : (
            <TextLink href={routes.houses.list()}>{`${occupancy}% · ${let_} of ${houses.total} houses let`}</TextLink>
          )}
        </DetailRow>
        <DetailRow label="Deposits held">{formatMoney(portfolio.depositsHeld)}</DetailRow>
        <DetailRow label="Rent paid in advance">{formatMoney(portfolio.advancePaid)}</DetailRow>
        {portfolio.paidDirectRent > 0 ? (
          <DetailRow label="of which Govt, paid direct">
            <TextLink href={routes.tenants.list({ show: "untracked" })}>
              {`${formatMoney(portfolio.paidDirectRent)} / month`}
            </TextLink>
          </DetailRow>
        ) : null}
      </DetailList>
    </SectionCard>
  );
}
