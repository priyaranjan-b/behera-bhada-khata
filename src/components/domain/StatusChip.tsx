import { StatusBadge, type BadgeTone } from "@/components/ui/DataDisplay";
import { statusLabel } from "@/lib/domain/status";

const TONE_BY_STATUS: Record<string, BadgeTone> = {
  pending: "warning",
  partially_paid: "warning",
  paid: "success",
  confirmed: "success",
  // A month that hasn't ended yet: billed ahead, not owed (summarizeBalance).
  not_due_yet: "neutral",
};

export function StatusChip({ status }: { status: string }) {
  return <StatusBadge tone={TONE_BY_STATUS[status] ?? "neutral"} label={statusLabel(status)} />;
}
