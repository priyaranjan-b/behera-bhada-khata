import type { AttentionItem } from "@/lib/domain/overview";
import NeedsAttentionCard from "@/components/domain/NeedsAttentionCard";

export default async function AttentionSection({ attention }: { attention: Promise<AttentionItem[]> }) {
  return <NeedsAttentionCard items={await attention} />;
}
