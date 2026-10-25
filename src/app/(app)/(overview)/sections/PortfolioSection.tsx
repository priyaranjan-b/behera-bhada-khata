import type { HouseCounts, PortfolioFacts } from "@/lib/contracts";
import PortfolioCard from "@/components/domain/PortfolioCard";

export default async function PortfolioSection({
  portfolio,
  houses,
}: {
  portfolio: Promise<PortfolioFacts>;
  houses: Promise<HouseCounts>;
}) {
  const [facts, counts] = await Promise.all([portfolio, houses]);
  return <PortfolioCard portfolio={facts} houses={counts} />;
}
