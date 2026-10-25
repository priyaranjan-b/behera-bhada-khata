import Stack from "@mui/material/Stack";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AddHomeWorkRoundedIcon from "@mui/icons-material/AddHomeWorkRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import { serverApi } from "@/lib/api-client/server";
import { routes } from "@/lib/routes";
import { PageHeader } from "@/components/ui/DataDisplay";
import { ActionStack } from "@/components/ui";
import AsyncSection from "@/components/ui/AsyncSection";
import LinkButton from "@/components/ui/Loading/LinkButton";
import { PanelSkeleton } from "@/components/ui/Skeletons";
import HousesSection from "./sections/HousesSection";
import TenantsSection from "./sections/TenantsSection";

// The page loads in sections (A12): it waits only for the header (and its
// 404), then streams the houses and the tenants on their own calls. No
// loading.tsx here: one would also show while the tower's forms load.
export default async function PropertyPage({ params }: { params: Promise<{ propertyCode: string }> }) {
  const { propertyCode } = await params;
  const property = await serverApi.dashboard.properties.detail(propertyCode);
  const units = serverApi.dashboard.properties.units(propertyCode);
  const tenants = serverApi.dashboard.properties.tenants(propertyCode);

  const actions = (
    <ActionStack>
      <LinkButton href={routes.properties.newUnit(property.code)} variant="outlined" startIcon={<AddHomeWorkRoundedIcon />}>
        Add house
      </LinkButton>
      <LinkButton href={routes.properties.bulkTenants(property.code)} variant="outlined" startIcon={<UploadFileRoundedIcon />}>
        Bulk upload
      </LinkButton>
      <LinkButton href={routes.properties.newTenant(property.code)} variant="contained" startIcon={<AddRoundedIcon />}>
        Add tenant
      </LinkButton>
    </ActionStack>
  );

  return (
    <Stack spacing={2}>
      <PageHeader title={property.name} subtitle={`${property.code} · ${property.locationName}`} action={actions} />

      <AsyncSection title="Houses" fallback={<PanelSkeleton rows={6} />}>
        <HousesSection units={units} propertyName={property.name} />
      </AsyncSection>

      <AsyncSection title="Tenants" fallback={<PanelSkeleton rows={4} />}>
        <TenantsSection tenants={tenants} propertyName={property.name} />
      </AsyncSection>
    </Stack>
  );
}
