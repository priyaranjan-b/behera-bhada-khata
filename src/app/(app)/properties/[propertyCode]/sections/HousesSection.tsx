import MeetingRoomRoundedIcon from "@mui/icons-material/MeetingRoomRounded";
import type { UnitRow } from "@/lib/contracts";
import { EmptyState } from "@/components/ui/DataDisplay";
import UnitsGrid from "@/components/domain/UnitsGrid";

/** Tower page: its houses, with who is in each. */
export default async function HousesSection({ units, propertyName }: { units: Promise<UnitRow[]>; propertyName: string }) {
  const rows = await units;
  const vacant = rows.filter((u) => u.isActive && !u.currentTenant).length;
  return (
    <UnitsGrid
      units={rows}
      propertyName={propertyName}
      subtitle={rows.length ? `${vacant} vacant` : undefined}
      emptyState={
        <EmptyState
          icon={<MeetingRoomRoundedIcon />}
          title="No houses yet"
          description="Add the houses, shops and rooms in this tower so tenants can be placed in them."
        />
      }
    />
  );
}
