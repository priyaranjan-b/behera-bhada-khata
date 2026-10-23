import { StatusBadge, type BadgeTone } from "@/components/ui/DataDisplay";

const TONE_BY_STATUS: Record<string, BadgeTone> = {
  pending: "warning",
  partially_paid: "warning",
  paid: "success",
  confirmed: "success",
};

export function StatusChip({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  return <StatusBadge tone={TONE_BY_STATUS[status] ?? "neutral"} label={label.charAt(0).toUpperCase() + label.slice(1)} />;
}
