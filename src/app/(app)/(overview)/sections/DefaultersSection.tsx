import type { DefaultersReport } from "@/lib/contracts";
import TopDefaultersCard from "@/components/domain/TopDefaultersCard";

export default async function DefaultersSection({ defaulters }: { defaulters: Promise<DefaultersReport> }) {
  return <TopDefaultersCard report={await defaulters} />;
}
