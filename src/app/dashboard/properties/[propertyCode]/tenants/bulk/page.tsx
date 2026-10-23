import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import BulkTenantUpload from "./BulkTenantUpload";

export default async function BulkTenantUploadPage({ params }: { params: Promise<{ propertyCode: string }> }) {
  const { propertyCode } = await params;
  const { property, availableUnits } = await serverApi.dashboard.properties.bulkTenants(propertyCode);

  return (
    <Stack spacing={2}>
      <PageHeader title="Bulk upload tenants" subtitle={`${property.name} · ${property.code}`} />
      <BulkTenantUpload propertyCode={property.code} vacantUnitCodes={availableUnits.map((u) => u.unitCode)} />
    </Stack>
  );
}
