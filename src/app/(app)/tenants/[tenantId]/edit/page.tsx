import Stack from "@mui/material/Stack";
import { serverApi } from "@/lib/api-client/server";
import { PageHeader } from "@/components/ui/DataDisplay";
import TenantForm from "@/components/domain/TenantForm";

export default async function EditTenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { tenant, availableUnits, documents } = await serverApi.dashboard.tenants.edit(tenantId);

  return (
    <Stack spacing={2}>
      <PageHeader
        title={`Edit ${tenant.businessName || tenant.name}`}
        subtitle="Changes to houses and rent take effect from the dates you choose; earlier months stay as they were."
      />
      {/* Documents show in the form's right column; new ones upload with Save. */}
      <TenantForm mode={{ kind: "edit", tenant }} availableUnits={availableUnits} documents={documents} />
    </Stack>
  );
}
