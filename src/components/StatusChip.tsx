import Chip, { type ChipProps } from "@mui/material/Chip";

const COLOR_BY_STATUS: Record<string, ChipProps["color"]> = {
  pending: "warning",
  partially_paid: "warning",
  paid: "success",
  confirmed: "success",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <Chip size="small" color={COLOR_BY_STATUS[status] ?? "default"} label={status.replace(/_/g, " ")} />
  );
}
