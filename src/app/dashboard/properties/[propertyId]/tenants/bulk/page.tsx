import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/DataComponents";
import BulkTenantUpload from "./BulkTenantUpload";

export default async function BulkTenantUploadPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const property = await serverApi.dashboard.properties.bulkTenants(propertyId);

  return (
    <Stack spacing={2}>
      <PageHeader title="Bulk upload tenants" subtitle={property.name} />
      <BulkTenantUpload propertyId={propertyId} />
    </Stack>
  );
}
