import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/DataComponents";
import TenantForm from "./TenantForm";

export default async function NewTenantPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  // 404s if the property isn't the owner's.
  await serverApi.dashboard.properties.newTenant(propertyId);

  return (
    <Stack spacing={2}>
      <PageHeader title="Add tenant" subtitle="Rent is owed monthly from the lease start date." />
      <TenantForm propertyId={propertyId} />
    </Stack>
  );
}
