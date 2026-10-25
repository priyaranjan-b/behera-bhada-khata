import { DetailList, DetailRow, SectionCard } from "@/components/ui";
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
    <SectionCard title="Portfolio" fill>
      <DetailList dividers>
        <DetailRow label="Monthly rent roll">{formatMoney(portfolio.rentRoll)}</DetailRow>
        <DetailRow label="Occupancy">
          {occupancy === null ? "—" : `${occupancy}% · ${let_} of ${houses.total} houses let`}
        </DetailRow>
        <DetailRow label="Deposits held">{formatMoney(portfolio.depositsHeld)}</DetailRow>
        <DetailRow label="Rent paid in advance">{formatMoney(portfolio.advancePaid)}</DetailRow>
        {portfolio.paidDirectRent > 0 ? (
          <DetailRow label="Govt rent paid direct">{`${formatMoney(portfolio.paidDirectRent)} / month`}</DetailRow>
        ) : null}
      </DetailList>
    </SectionCard>
  );
}
