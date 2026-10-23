import { StatusBadge, type BadgeTone } from "@/components/ui/DataDisplay";

const TONE_BY_STATUS: Record<string, BadgeTone> = {
  pending: "warning",
  partially_paid: "warning",
  paid: "success",
  confirmed: "success",
  // A month that hasn't ended yet: billed ahead, not owed (summarizeBalance).
  not_due_yet: "neutral",
};

export function StatusChip({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return <StatusBadge tone={TONE_BY_STATUS[status] ?? "neutral"} label={label.charAt(0).toUpperCase() + label.slice(1)} />;
}
