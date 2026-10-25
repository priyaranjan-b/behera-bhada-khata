import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import TenantForm from "@/components/domain/TenantForm";

export default async function NewTenantPage({ params }: { params: Promise<{ propertyCode: string }> }) {
  const { propertyCode } = await params;
  const { property, availableUnits } = await serverApi.dashboard.properties.newTenant(propertyCode);

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Add tenant"
        subtitle={`From ${property.name}. Choose one or more houses; one rent is billed monthly for all of them.`}
      />
      <TenantForm mode={{ kind: "create", propertyCode: property.code }} availableUnits={availableUnits} />
    </Stack>
  );
}
