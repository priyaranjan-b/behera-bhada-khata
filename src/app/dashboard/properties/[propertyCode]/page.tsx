import Link from "@/components/ui/Link";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AddHomeWorkRoundedIcon from "@mui/icons-material/AddHomeWorkRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";
import MeetingRoomRoundedIcon from "@mui/icons-material/MeetingRoomRounded";
import { serverApi } from "@/lib/api-client/server";
import { DashboardCardPanel, EmptyState, PageHeader } from "@/components/ui/DataDisplay";
import { ActionStack } from "@/components/ui";
import PropertyTenantsGrid from "./PropertyTenantsGrid";
import UnitsGrid from "./UnitsGrid";

export default async function PropertyPage({ params }: { params: Promise<{ propertyCode: string }> }) {
  const { propertyCode } = await params;
  const { property, units, tenants } = await serverApi.dashboard.properties.detail(propertyCode);
  const base = `/dashboard/properties/${property.code}`;
  const vacant = units.filter((u) => u.isActive && !u.currentTenant).length;

  const actions = (
    <ActionStack>
      <Button component={Link} href={`${base}/units/new`} variant="outlined" startIcon={<AddHomeWorkRoundedIcon />}>
        Add house
      </Button>
      <Button component={Link} href={`${base}/tenants/bulk`} variant="outlined" startIcon={<UploadFileRoundedIcon />}>
        Bulk upload
      </Button>
      <Button component={Link} href={`${base}/tenants/new`} variant="contained" startIcon={<AddRoundedIcon />}>
        Add tenant
      </Button>
    </ActionStack>
  );

  return (
    <Stack spacing={2}>
      <PageHeader title={property.name} subtitle={`${property.code} · ${property.locationName}`} action={actions} />

      <DashboardCardPanel
        title="Houses"
        subtitle={units.length ? `${units.length} house${units.length === 1 ? "" : "s"} · ${vacant} vacant` : undefined}
        flush
      >
        {units.length === 0 ? (
          <EmptyState
            icon={<MeetingRoomRoundedIcon />}
            title="No houses yet"
            description="Add the houses, shops and rooms in this tower so tenants can be placed in them."
          />
        ) : (
          <UnitsGrid units={units} propertyName={property.name} />
        )}
      </DashboardCardPanel>

      <DashboardCardPanel
        title="Tenants"
        subtitle={tenants.length ? `${tenants.length} current tenant${tenants.length === 1 ? "" : "s"}` : undefined}
        flush
      >
        {tenants.length === 0 ? (
          <EmptyState
            icon={<PeopleOutlineRoundedIcon />}
            title="No tenants yet"
            description="Add a tenant to one or more vacant houses, or bulk upload several at once."
          />
        ) : (
          <PropertyTenantsGrid rows={tenants} propertyName={property.name} />
        )}
      </DashboardCardPanel>
    </Stack>
  );
}
