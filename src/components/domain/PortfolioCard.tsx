import MuiLink from "@mui/material/Link";
import { DetailList, DetailRow, SectionCard } from "@/components/ui";
import Link from "@/components/ui/Link";
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
          <MuiLink component={Link} href={routes.tenants.list({ show: "current" })}>
            {formatMoney(portfolio.rentRoll)}
          </MuiLink>
        </DetailRow>
        <DetailRow label="Occupancy">
          {occupancy === null ? (
            "—"
          ) : (
            <MuiLink component={Link} href={routes.houses.list()}>{`${occupancy}% · ${let_} of ${houses.total} houses let`}</MuiLink>
          )}
        </DetailRow>
        <DetailRow label="Deposits held">{formatMoney(portfolio.depositsHeld)}</DetailRow>
        <DetailRow label="Rent paid in advance">{formatMoney(portfolio.advancePaid)}</DetailRow>
        {portfolio.paidDirectRent > 0 ? (
          <DetailRow label="of which Govt, paid direct">
            <MuiLink component={Link} href={routes.tenants.list({ show: "untracked" })}>
              {`${formatMoney(portfolio.paidDirectRent)} / month`}
            </MuiLink>
          </DetailRow>
        ) : null}
      </DetailList>
    </SectionCard>
  );
}
