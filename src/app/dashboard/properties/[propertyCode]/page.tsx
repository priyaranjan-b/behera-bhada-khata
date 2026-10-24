import Stack from "@mui/material/Stack";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AddHomeWorkRoundedIcon from "@mui/icons-material/AddHomeWorkRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";
import MeetingRoomRoundedIcon from "@mui/icons-material/MeetingRoomRounded";
import { serverApi } from "@/lib/api-client/server";
import { EmptyState, PageHeader } from "@/components/ui/DataDisplay";
import { ActionStack } from "@/components/ui";
import PropertyTenantsGrid from "./PropertyTenantsGrid";
import UnitsGrid from "./UnitsGrid";
import LinkButton from "@/components/ui/Loading/LinkButton";

export default async function PropertyPage({ params }: { params: Promise<{ propertyCode: string }> }) {
  const { propertyCode } = await params;
  const { property, units, tenants } = await serverApi.dashboard.properties.detail(propertyCode);
  const base = `/dashboard/properties/${property.code}`;
  const vacant = units.filter((u) => u.isActive && !u.currentTenant).length;

  const actions = (
    <ActionStack>
      <LinkButton href={`${base}/units/new`} variant="outlined" startIcon={<AddHomeWorkRoundedIcon />}>
        Add house
      </LinkButton>
      <LinkButton href={`${base}/tenants/bulk`} variant="outlined" startIcon={<UploadFileRoundedIcon />}>
        Bulk upload
      </LinkButton>
      <LinkButton href={`${base}/tenants/new`} variant="contained" startIcon={<AddRoundedIcon />}>
        Add tenant
      </LinkButton>
    </ActionStack>
  );

  return (
    <Stack spacing={2}>
      <PageHeader title={property.name} subtitle={`${property.code} · ${property.locationName}`} action={actions} />

      <UnitsGrid
        units={units}
        propertyName={property.name}
        subtitle={units.length ? `${vacant} vacant` : undefined}
        emptyState={
          <EmptyState
            icon={<MeetingRoomRoundedIcon />}
            title="No houses yet"
            description="Add the houses, shops and rooms in this tower so tenants can be placed in them."
          />
        }
      />

      <PropertyTenantsGrid
        rows={tenants}
        propertyName={property.name}
        emptyState={
          <EmptyState
            icon={<PeopleOutlineRoundedIcon />}
            title="No tenants yet"
            description="Add a tenant to one or more vacant houses, or bulk upload several at once."
          />
        }
      />
    </Stack>
  );
}
