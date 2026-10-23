import Link from "@/components/Link";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";
import { serverApi } from "@/lib/api-client/server";
import { DashboardCardPanel, EmptyState, PageHeader } from "@/components/DataComponents";
import { ActionStack } from "@/components/ui";
import PropertyTenantsGrid from "./PropertyTenantsGrid";

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const { property, tenants: rows } = await serverApi.dashboard.properties.detail(propertyId);

  const actions = (
    <ActionStack>
      <Button
        component={Link}
        href={`/dashboard/properties/${property.id}/tenants/bulk`}
        variant="outlined"
        startIcon={<UploadFileRoundedIcon />}
      >
        Bulk upload
      </Button>
      <Button
        component={Link}
        href={`/dashboard/properties/${property.id}/tenants/new`}
        variant="contained"
        startIcon={<AddRoundedIcon />}
      >
        Add tenant
      </Button>
    </ActionStack>
  );

  return (
    <Stack spacing={2}>
      <PageHeader title={property.name} subtitle={property.address || undefined} action={actions} />

      <DashboardCardPanel
        title="Tenants"
        subtitle={rows.length ? `${rows.length} tenant${rows.length === 1 ? "" : "s"} at this property` : undefined}
        flush
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<PeopleOutlineRoundedIcon />}
            title="No tenants yet"
            description="Add a tenant to start tracking their rent, or bulk upload several at once."
          />
        ) : (
          <PropertyTenantsGrid rows={rows} propertyName={property.name} />
        )}
      </DashboardCardPanel>
    </Stack>
  );
}
